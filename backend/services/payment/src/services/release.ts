import { AppError, createLogger, errors, publish, TOPICS } from "@hustl/common"
import { payoutBreakdown, type ReleaseMilestoneResponse } from "@hustl/contracts"
import { prisma, Prisma, type Payout } from "@hustl/db"
import { availableEscrow, settledEscrowStatus } from "../domain/escrow"
import { toEscrowSummary, toPayoutDTO } from "../lib/dto"
import { getProvider } from "../providers"

type Tx = Prisma.TransactionClient
const log = createLogger("payment-service:release")

/** Row-locks the deal's escrow for the rest of the transaction and returns it fresh. */
export async function lockEscrow(tx: Tx, dealId: string) {
  await tx.$queryRaw`SELECT id FROM escrow_accounts WHERE deal_id = ${dealId}::uuid FOR UPDATE`
  return tx.escrowAccount.findUnique({ where: { dealId } })
}

/**
 * Writes a payout (unique per milestone), RELEASE + CREATOR_FEE ledger rows,
 * bumps escrow.releasedAmount and publishes `milestone.payment_released`.
 * Must run inside a transaction. Provider transfer happens after commit.
 */
export async function createRelease(
  tx: Tx,
  input: { dealId: string; milestoneId: string; creatorId: string; gross: number; creatorFeeRate: number; allowFrozen?: boolean; disputeId?: string; partial?: boolean },
): Promise<Payout> {
  const escrow = await lockEscrow(tx, input.dealId)
  if (!escrow || escrow.fundedAmount <= 0) throw errors.conflict("Escrow is not funded for this deal", { dealId: input.dealId })
  if (escrow.status === "FROZEN" && !input.allowFrozen)
    throw errors.conflict("Escrow is frozen while a dispute is open", { dealId: input.dealId, escrowStatus: escrow.status })
  const available = availableEscrow(escrow)
  if (input.gross > available) throw errors.conflict("Insufficient escrow balance for this release", { available, required: input.gross })

  const { fee, net } = payoutBreakdown(input.gross, input.creatorFeeRate)
  const payout = await tx.payout.create({
    data: { dealId: input.dealId, milestoneId: input.milestoneId, creatorId: input.creatorId, gross: input.gross, fee, net, status: "PENDING", provider: escrow.provider },
  })
  await tx.ledgerEntry.createMany({
    data: [
      { dealId: input.dealId, milestoneId: input.milestoneId, type: "RELEASE", amount: net, provider: escrow.provider, providerRef: payout.id },
      { dealId: input.dealId, milestoneId: input.milestoneId, type: "CREATOR_FEE", amount: fee, provider: escrow.provider, providerRef: payout.id },
    ],
  })
  const next = { ...escrow, releasedAmount: escrow.releasedAmount + input.gross }
  await tx.escrowAccount.update({
    where: { id: escrow.id },
    data: { releasedAmount: next.releasedAmount, status: escrow.status === "FROZEN" ? "FROZEN" : settledEscrowStatus(next) },
  })
  await publish(tx, TOPICS.PAYMENT_RELEASED, input.dealId, {
    dealId: input.dealId,
    milestoneId: input.milestoneId,
    payoutId: payout.id,
    creatorId: input.creatorId,
    gross: input.gross,
    fee,
    net,
    partial: !!input.partial,
    ...(input.disputeId && { disputeId: input.disputeId }),
  })
  return payout
}

/**
 * Sends the net amount to the creator's connected account. Never throws: the
 * release is already committed; failures leave the payout ON_HOLD / FAILED with a reason.
 */
export async function attemptTransfer(payout: Payout): Promise<Payout> {
  if (payout.status === "PAID") return payout
  try {
    const provider = getProvider(payout.provider)
    let accountId = "test_sandbox"
    if (payout.provider !== "TEST") {
      const account = await prisma.payoutAccount.findUnique({ where: { creatorId: payout.creatorId } })
      if (!account || account.provider !== payout.provider || account.status !== "ACTIVE" || !account.providerAccountId) {
        const reason = !account || account.provider !== payout.provider ? "Creator has not connected a payout account" : `Payout account is ${account.status.toLowerCase()}`
        return prisma.payout.update({ where: { id: payout.id }, data: { status: "ON_HOLD", failureReason: reason } })
      }
      accountId = account.providerAccountId
    }
    const res = await provider.transferToCreator({ accountId, amount: payout.net, currency: "INR", dealId: payout.dealId, payoutId: payout.id, idempotencyKey: `payout:${payout.id}` })
    return prisma.payout.update({
      where: { id: payout.id },
      data: { status: res.status, providerRef: res.providerRef, failureReason: null, paidAt: res.status === "PAID" ? new Date() : null },
    })
  } catch (err) {
    const reason = err instanceof AppError ? `${err.message}${err.details ? ` ${JSON.stringify(err.details)}` : ""}` : (err as Error).message
    log.error({ err, payoutId: payout.id }, "creator transfer failed")
    return prisma.payout.update({ where: { id: payout.id }, data: { status: "FAILED", failureReason: reason.slice(0, 500) } })
  }
}

export async function retryHeldPayouts(creatorId: string) {
  const held = await prisma.payout.findMany({ where: { creatorId, status: { in: ["ON_HOLD", "FAILED"] } } })
  for (const p of held) await attemptTransfer(p)
}

/** Internal release for an APPROVED milestone. Idempotent: an existing payout is returned (and its transfer retried). */
export async function releaseMilestone(milestoneId: string): Promise<ReleaseMilestoneResponse> {
  const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId }, include: { deal: { include: { escrow: true } } } })
  if (!milestone) throw errors.notFound("Milestone")
  const deal = milestone.deal

  const existing = await prisma.payout.findUnique({ where: { milestoneId } })
  if (existing) {
    const payout = await attemptTransfer(existing)
    const escrow = await prisma.escrowAccount.findUnique({ where: { dealId: deal.id } })
    return { payout: toPayoutDTO(payout), escrow: toEscrowSummary(deal, escrow), alreadyReleased: true }
  }
  if (milestone.status !== "APPROVED") throw errors.conflict("Only approved milestones can be released", { from: milestone.status, action: "RELEASE" })

  let payout: Payout
  try {
    payout = await prisma.$transaction((tx) =>
      createRelease(tx, { dealId: deal.id, milestoneId, creatorId: deal.creatorId, gross: milestone.amount, creatorFeeRate: deal.creatorFeeRate }),
    )
  } catch (err) {
    // Concurrent release of the same milestone: the unique payout wins.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return releaseMilestone(milestoneId)
    throw err
  }
  payout = await attemptTransfer(payout)
  const escrow = await prisma.escrowAccount.findUnique({ where: { dealId: deal.id } })
  return { payout: toPayoutDTO(payout), escrow: toEscrowSummary(deal, escrow), alreadyReleased: false }
}
