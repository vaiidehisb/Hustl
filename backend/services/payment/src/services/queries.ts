import { errors, pageMeta, type AuthUser } from "@hustl/common"
import type { DealPaymentsResponse, OnboardingLinkRequest, OnboardingLinkResponse, PaymentSummary, PayoutAccountDTO, PayoutStatus } from "@hustl/contracts"
import { prisma, type LedgerEntryType } from "@hustl/db"
import { toDisputeDTO, toEscrowSummary, toIntentDTO, toLedgerDTO, toPayoutAccountDTO, toPayoutDTO } from "../lib/dto"
import { activeProvider } from "../providers"
import { retryHeldPayouts } from "./release"

const CREATOR_VISIBLE_LEDGER: LedgerEntryType[] = ["ESCROW_FUND", "RELEASE", "CREATOR_FEE", "REFUND"]

export async function dealPayments(user: AuthUser, dealId: string): Promise<DealPaymentsResponse> {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: { brand: { select: { userId: true } }, creator: { select: { userId: true } }, escrow: true } })
  if (!deal) throw errors.notFound("Deal")
  const isBrand = deal.brand.userId === user.id
  const isCreator = deal.creator.userId === user.id
  const isAdmin = user.role === "ADMIN"
  if (!isBrand && !isCreator && !isAdmin) throw errors.forbidden("Only the parties to this deal can view its payments")

  const [intents, ledger, payouts, disputes] = await Promise.all([
    isCreator && !isAdmin ? Promise.resolve([]) : prisma.paymentIntent.findMany({ where: { dealId }, orderBy: { createdAt: "desc" } }),
    prisma.ledgerEntry.findMany({ where: { dealId, ...(isCreator && !isBrand && !isAdmin && { type: { in: CREATOR_VISIBLE_LEDGER } }) }, orderBy: { createdAt: "asc" } }),
    prisma.payout.findMany({ where: { dealId }, include: { milestone: { select: { title: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.dispute.findMany({ where: { dealId }, orderBy: { createdAt: "desc" } }),
  ])
  return {
    escrow: toEscrowSummary(deal, deal.escrow),
    intents: intents.map(toIntentDTO),
    ledger: ledger.map((l) => toLedgerDTO(l)),
    payouts: payouts.map((p) => toPayoutDTO(p)),
    disputes: disputes.map((d) => toDisputeDTO(d)),
  }
}

export async function brandLedger(user: AuthUser, q: { page: number; pageSize: number; dealId?: string }) {
  const brand = await prisma.brandProfile.findUnique({ where: { userId: user.id } })
  if (!brand) throw errors.forbidden("Brand profile required")
  const where = { deal: { brandId: brand.id }, ...(q.dealId && { dealId: q.dealId }) }
  const [rows, total] = await Promise.all([
    prisma.ledgerEntry.findMany({ where, include: { deal: { select: { title: true } } }, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.ledgerEntry.count({ where }),
  ])
  return { items: rows.map((r) => toLedgerDTO(r)), meta: pageMeta(q, total) }
}

export async function creatorPayouts(user: AuthUser, q: { page: number; pageSize: number; status?: PayoutStatus }) {
  const creator = await prisma.creatorProfile.findUnique({ where: { userId: user.id } })
  if (!creator) throw errors.forbidden("Creator profile required")
  const where = { creatorId: creator.id, ...(q.status && { status: q.status }) }
  const [rows, total] = await Promise.all([
    prisma.payout.findMany({ where, include: { deal: { select: { title: true } }, milestone: { select: { title: true } } }, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.payout.count({ where }),
  ])
  return { items: rows.map((r) => toPayoutDTO(r)), meta: pageMeta(q, total) }
}

export async function paymentSummary(user: AuthUser): Promise<PaymentSummary> {
  const [brand, creator] = await Promise.all([prisma.brandProfile.findUnique({ where: { userId: user.id } }), prisma.creatorProfile.findUnique({ where: { userId: user.id } })])
  if (brand && user.role !== "CREATOR") {
    const sums = await prisma.ledgerEntry.groupBy({ by: ["type"], where: { deal: { brandId: brand.id } }, _sum: { amount: true } })
    const sum = (t: LedgerEntryType) => sums.find((s) => s.type === t)?._sum.amount ?? 0
    const escrows = await prisma.escrowAccount.findMany({ where: { deal: { brandId: brand.id }, fundedAmount: { gt: 0 } } })
    const held = escrows.map((e) => e.fundedAmount - e.releasedAmount - e.refundedAmount).filter((x) => x > 0)
    return { role: "BRAND", totalFunded: sum("ESCROW_FUND"), feesPaid: sum("BRAND_FEE") + sum("PROCESSING_FEE"), escrowHeld: held.reduce((a, b) => a + b, 0), refunded: sum("REFUND"), activeEscrows: held.length }
  }
  if (creator) {
    const [byStatus, account, escrows] = await Promise.all([
      prisma.payout.groupBy({ by: ["status"], where: { creatorId: creator.id }, _sum: { net: true, fee: true } }),
      prisma.payoutAccount.findUnique({ where: { creatorId: creator.id } }),
      prisma.escrowAccount.findMany({ where: { deal: { creatorId: creator.id }, fundedAmount: { gt: 0 } } }),
    ])
    const net = (s: PayoutStatus) => byStatus.find((b) => b.status === s)?._sum.net ?? 0
    return {
      role: "CREATOR",
      paidOut: net("PAID"),
      pendingPayouts: net("PENDING") + net("FAILED"),
      onHoldPayouts: net("ON_HOLD"),
      feesPaid: byStatus.reduce((a, b) => a + (b._sum.fee ?? 0), 0),
      inEscrow: escrows.reduce((a, e) => a + Math.max(0, e.fundedAmount - e.releasedAmount - e.refundedAmount), 0),
      payoutAccountStatus: (account?.status as PayoutAccountDTO["status"]) ?? "NOT_CONNECTED",
    }
  }
  throw errors.forbidden("A brand or creator profile is required")
}

async function creatorFor(user: AuthUser) {
  const creator = await prisma.creatorProfile.findUnique({ where: { userId: user.id }, include: { user: { select: { email: true, name: true } } } })
  if (!creator) throw errors.forbidden("Creator profile required")
  return creator
}

export async function getPayoutAccount(user: AuthUser): Promise<PayoutAccountDTO> {
  const creator = await creatorFor(user)
  return toPayoutAccountDTO(creator.id, await prisma.payoutAccount.findUnique({ where: { creatorId: creator.id } }))
}

export async function createOnboardingLink(user: AuthUser, body: OnboardingLinkRequest): Promise<OnboardingLinkResponse> {
  const creator = await creatorFor(user)
  const provider = activeProvider()
  const existing = await prisma.payoutAccount.findUnique({ where: { creatorId: creator.id } })
  const appUrl = process.env.PUBLIC_APP_URL ?? "http://localhost:3000"
  const res = await provider.createPayoutAccountLink({
    creatorId: creator.id,
    email: creator.user.email,
    name: creator.user.name,
    existingAccountId: existing && existing.provider === provider.name ? existing.providerAccountId : null,
    returnUrl: body.returnUrl ?? `${appUrl}/creator/payouts?onboarding=return`,
    refreshUrl: body.refreshUrl ?? `${appUrl}/creator/payouts?onboarding=refresh`,
    razorpay: body.razorpay,
  })
  const account = await prisma.payoutAccount.upsert({
    where: { creatorId: creator.id },
    create: { creatorId: creator.id, provider: provider.name, providerAccountId: res.accountId, status: res.status, detailsSubmitted: res.detailsSubmitted },
    update: { provider: provider.name, providerAccountId: res.accountId, status: res.status, detailsSubmitted: res.detailsSubmitted },
  })
  if (account.status === "ACTIVE") await retryHeldPayouts(creator.id)
  return { account: toPayoutAccountDTO(creator.id, account), url: res.url }
}
