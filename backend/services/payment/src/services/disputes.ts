import { createLogger, errors, pageMeta, publish, TOPICS, type AuthUser } from "@hustl/common"
import type { InternalCreateDisputeRequest, ResolveDisputeRequest, ResolveDisputeResponse } from "@hustl/contracts"
import { prisma, Prisma, type LedgerEntry, type Payout } from "@hustl/db"
import { disputeSplit, settledEscrowStatus } from "../domain/escrow"
import { toDisputeDTO, toEscrowSummary, toLedgerDTO, toPayoutDTO } from "../lib/dto"
import { getProvider } from "../providers"
import { attemptTransfer, createRelease, lockEscrow } from "./release"

const log = createLogger("payment-service:disputes")
const OPEN = ["OPEN", "UNDER_REVIEW"] as const

/** Internal: opened by deal-service. Idempotent — an existing open dispute on the deal is returned. */
export async function createDispute(input: InternalCreateDisputeRequest) {
  const deal = await prisma.deal.findUnique({ where: { id: input.dealId }, include: { brand: { select: { userId: true } }, creator: { select: { userId: true } } } })
  if (!deal) throw errors.notFound("Deal")
  if (input.raisedById !== deal.brand.userId && input.raisedById !== deal.creator.userId) throw errors.forbidden("Only a party to the deal can raise a dispute")
  if (!["FUNDED", "IN_PROGRESS", "DISPUTED"].includes(deal.status)) throw errors.conflict("Disputes can only be raised on funded deals", { from: deal.status, action: "DISPUTE" })
  if (input.milestoneId) {
    const m = await prisma.milestone.findFirst({ where: { id: input.milestoneId, dealId: deal.id } })
    if (!m) throw errors.notFound("Milestone")
  }

  return prisma.$transaction(async (tx) => {
    const escrow = await lockEscrow(tx, deal.id)
    if (!escrow || escrow.fundedAmount <= 0) throw errors.conflict("Escrow is not funded for this deal")
    const open = await tx.dispute.findFirst({ where: { dealId: deal.id, status: { in: [...OPEN] } } })
    if (open) return { dispute: toDisputeDTO(open), escrow: toEscrowSummary(deal, escrow), created: false }

    const dispute = await tx.dispute.create({
      data: { dealId: deal.id, milestoneId: input.milestoneId ?? null, raisedById: input.raisedById, reason: input.reason, evidenceIds: input.evidenceIds },
    })
    const frozen = await tx.escrowAccount.update({ where: { id: escrow.id }, data: { status: "FROZEN", frozenAt: new Date() } })
    const payload = { disputeId: dispute.id, dealId: deal.id, milestoneId: dispute.milestoneId, raisedById: dispute.raisedById, reason: dispute.reason, brandUserId: deal.brand.userId, creatorUserId: deal.creator.userId }
    await publish(tx, TOPICS.DISPUTE_OPENED, deal.id, payload)
    await publish(tx, TOPICS.PAYMENT_DISPUTED, deal.id, { dealId: deal.id, disputeId: dispute.id, escrowStatus: "FROZEN", heldAmount: frozen.fundedAmount - frozen.releasedAmount - frozen.refundedAmount })
    return { dispute: toDisputeDTO(dispute), escrow: toEscrowSummary(deal, frozen), created: true }
  })
}

export async function freezeEscrow(dealId: string) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId } })
  if (!deal) throw errors.notFound("Deal")
  return prisma.$transaction(async (tx) => {
    const escrow = await lockEscrow(tx, dealId)
    if (!escrow || escrow.fundedAmount <= 0) throw errors.conflict("Escrow is not funded for this deal")
    const frozen = escrow.status === "FROZEN" ? escrow : await tx.escrowAccount.update({ where: { id: escrow.id }, data: { status: "FROZEN", frozenAt: new Date() } })
    return toEscrowSummary(deal, frozen)
  })
}

export async function resolveDispute(admin: AuthUser, disputeId: string, body: ResolveDisputeRequest): Promise<ResolveDisputeResponse> {
  const dispute = await prisma.dispute.findUnique({ where: { id: disputeId }, include: { deal: { include: { milestones: { orderBy: { position: "asc" } }, escrow: true } } } })
  if (!dispute) throw errors.notFound("Dispute")
  if (dispute.status === "RESOLVED") throw errors.conflict("Dispute is already resolved", { from: dispute.status, action: "RESOLVE" })
  const deal = dispute.deal
  if (!deal.escrow || deal.escrow.fundedAmount <= 0) throw errors.conflict("Escrow is not funded for this deal")

  // Milestones this resolution settles: the disputed one, or every unsettled milestone for a deal-wide dispute.
  const candidates = dispute.milestoneId ? deal.milestones.filter((m) => m.id === dispute.milestoneId) : deal.milestones
  const ids = candidates.map((m) => m.id)
  const [payouts, refunds] = await Promise.all([
    prisma.payout.findMany({ where: { milestoneId: { in: ids } }, select: { milestoneId: true } }),
    prisma.ledgerEntry.findMany({ where: { milestoneId: { in: ids }, type: "REFUND" }, select: { milestoneId: true } }),
  ])
  const settled = new Set([...payouts.map((p) => p.milestoneId), ...refunds.map((r) => r.milestoneId!)])
  const targets = candidates
    .filter((m) => !settled.has(m.id))
    .map((m) => ({ milestone: m, ...disputeSplit(m.amount, body.resolution, body.splitCreatorPercent) }))

  const fundingRef = (await prisma.ledgerEntry.findFirst({ where: { dealId: deal.id, type: "ESCROW_FUND" }, orderBy: { createdAt: "asc" } }))?.providerRef
  const provider = getProvider(deal.escrow.provider)

  // Provider refunds go first (idempotency keyed per dispute+milestone) so the ledger records real references.
  const refundRefs = new Map<string, string>()
  for (const t of targets.filter((x) => x.brandRefund > 0)) {
    if (!fundingRef) throw errors.conflict("No funding payment reference recorded for this deal; refund cannot be issued")
    const res = await provider.refund({ paymentRef: fundingRef, amount: t.brandRefund, dealId: deal.id, idempotencyKey: `refund:${dispute.id}:${t.milestone.id}` })
    refundRefs.set(t.milestone.id, res.providerRef)
  }

  let created: { payouts: Payout[]; refunds: LedgerEntry[] }
  try {
    created = await prisma.$transaction(async (tx) => {
      const claimed = await tx.dispute.updateMany({
        where: { id: dispute.id, status: { in: [...OPEN] } },
        data: { status: "RESOLVED", resolution: body.resolution, splitCreatorPercent: body.splitCreatorPercent ?? null, adminNote: body.note, resolvedById: admin.id, resolvedAt: new Date() },
      })
      if (claimed.count === 0) throw errors.conflict("Dispute is already resolved")

      const out = { payouts: [] as Payout[], refunds: [] as LedgerEntry[] }
      for (const t of targets) {
        if (t.creatorGross > 0)
          out.payouts.push(
            await createRelease(tx, {
              dealId: deal.id,
              milestoneId: t.milestone.id,
              creatorId: deal.creatorId,
              gross: t.creatorGross,
              creatorFeeRate: deal.creatorFeeRate,
              allowFrozen: true,
              disputeId: dispute.id,
              partial: t.brandRefund > 0,
            }),
          )
        if (t.brandRefund > 0) {
          const escrow = (await lockEscrow(tx, deal.id))!
          const available = escrow.fundedAmount - escrow.releasedAmount - escrow.refundedAmount
          if (t.brandRefund > available) throw errors.conflict("Insufficient escrow balance for this refund", { available, required: t.brandRefund })
          const entry = await tx.ledgerEntry.create({
            data: { dealId: deal.id, milestoneId: t.milestone.id, type: "REFUND", amount: t.brandRefund, provider: escrow.provider, providerRef: refundRefs.get(t.milestone.id) ?? null },
          })
          await tx.escrowAccount.update({ where: { id: escrow.id }, data: { refundedAmount: escrow.refundedAmount + t.brandRefund } })
          await publish(tx, TOPICS.PAYMENT_REFUNDED, deal.id, {
            dealId: deal.id,
            milestoneId: t.milestone.id,
            disputeId: dispute.id,
            amount: t.brandRefund,
            partial: t.creatorGross > 0,
          })
          out.refunds.push(entry)
        }
      }

      const escrow = (await lockEscrow(tx, deal.id))!
      const stillOpen = await tx.dispute.count({ where: { dealId: deal.id, status: { in: [...OPEN] } } })
      if (!stillOpen) await tx.escrowAccount.update({ where: { id: escrow.id }, data: { status: settledEscrowStatus(escrow), frozenAt: null } })

      await publish(tx, TOPICS.DISPUTE_RESOLVED, deal.id, {
        disputeId: dispute.id,
        dealId: deal.id,
        milestoneId: dispute.milestoneId,
        resolution: body.resolution,
        splitCreatorPercent: body.splitCreatorPercent ?? null,
        settledMilestoneIds: targets.map((t) => t.milestone.id),
      })
      return out
    })
  } catch (err) {
    if (refundRefs.size) log.error({ err, disputeId, refunds: [...refundRefs.entries()] }, "dispute resolution failed after provider refunds were issued; retry resolves with the same refund keys")
    throw err
  }

  const paid = [] as Payout[]
  for (const p of created.payouts) paid.push(await attemptTransfer(p))
  const fresh = await prisma.dispute.findUniqueOrThrow({ where: { id: disputeId } })
  return { dispute: toDisputeDTO(fresh), payouts: paid.map((p) => toPayoutDTO(p)), refunds: created.refunds.map((r) => toLedgerDTO(r)) }
}

export async function listDisputes(query: { status?: "OPEN" | "UNDER_REVIEW" | "RESOLVED"; page: number; pageSize: number }) {
  const where: Prisma.DisputeWhereInput = query.status ? { status: query.status } : {}
  const [rows, total] = await Promise.all([
    prisma.dispute.findMany({ where, include: { deal: { select: { title: true } } }, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.dispute.count({ where }),
  ])
  return { items: rows.map(toDisputeDTO), meta: pageMeta(query, total) }
}
