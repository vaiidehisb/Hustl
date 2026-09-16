// Deal reads (party-scoped), reviews, consumers and internal lookups.

import { createLogger, errors, pageMeta, type AuthUser, type EventEnvelope } from "@hustl/common"
import type { CreateReviewRequest, DealParticipantsDTO, InternalDealDTO, ListDealsQuery } from "@hustl/contracts"
import { prisma, type Prisma } from "@hustl/db"
import { lockDeal, partyOf, recordDealEvent, requireParty, transitionDeal } from "../lib/deal-access"
import { dealDetailInclude, dealSummaryInclude, toContractDTO, toDealDetail, toDealSummary } from "../lib/dto"
import { applyMilestoneSettlement } from "./milestones"
import { recomputeCreatorStats } from "./stats"

const log = createLogger("deal-service:deals")

export async function dealDetail(user: AuthUser, dealId: string) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: dealDetailInclude })
  if (!deal) throw errors.notFound("Deal")
  const party = partyOf(deal, user, { allowAdmin: true })
  return toDealDetail(deal, party, user.id)
}

export async function listDeals(user: AuthUser, q: ListDealsQuery) {
  const [brand, creator] = await Promise.all([
    prisma.brandProfile.findUnique({ where: { userId: user.id }, select: { id: true } }),
    prisma.creatorProfile.findUnique({ where: { userId: user.id }, select: { id: true } }),
  ])
  const as = q.role ?? (user.role === "CREATOR" ? "creator" : user.role === "BRAND" ? "brand" : brand ? "brand" : "creator")
  const scope: Prisma.DealWhereInput | null = as === "brand" ? (brand ? { brandId: brand.id } : null) : creator ? { creatorId: creator.id } : null
  if (!scope) {
    if (user.role !== "ADMIN") throw errors.forbidden(`A ${as} profile is required`)
  }
  const where: Prisma.DealWhereInput = { ...(scope ?? {}), ...(q.status && { status: { in: q.status } }) }
  const [rows, total] = await Promise.all([
    prisma.deal.findMany({ where, include: dealSummaryInclude, orderBy: { updatedAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.deal.count({ where }),
  ])
  return { items: rows.map((d) => toDealSummary(d, scope ? (as === "brand" ? "BRAND" : "CREATOR") : "ADMIN", user.id)), meta: pageMeta(q, total) }
}

export async function getContract(user: AuthUser, dealId: string) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: { brand: { select: { userId: true } }, creator: { select: { userId: true } }, contract: true } })
  if (!deal) throw errors.notFound("Deal")
  const party = partyOf(deal, user, { allowAdmin: true })
  if (!deal.contract) throw errors.notFound("Contract")
  return toContractDTO(deal.contract, party)
}

export async function createReview(user: AuthUser, dealId: string, body: CreateReviewRequest) {
  return prisma.$transaction(async (tx) => {
    const deal = await lockDeal(tx, dealId)
    const party = requireParty(deal, user)
    if (deal.status !== "COMPLETED") throw errors.conflict("Reviews open once the deal is complete", { from: deal.status, action: "REVIEW" })
    if (await tx.review.findUnique({ where: { dealId_authorId: { dealId, authorId: user.id } } })) throw errors.conflict("You have already reviewed this deal")
    const subjectUserId = party === "BRAND" ? deal.creator.userId : deal.brand.userId
    const review = await tx.review.create({ data: { dealId, authorId: user.id, subjectUserId, rating: body.rating, comment: body.comment } })
    await recordDealEvent(tx, dealId, "REVIEW_SUBMITTED", user.id, { reviewId: review.id, rating: body.rating, by: party })
    if (party === "BRAND") await recomputeCreatorStats(tx, deal.creatorId)
    return { id: review.id, dealId, authorId: review.authorId, subjectUserId, rating: review.rating, comment: review.comment, createdAt: review.createdAt.toISOString() }
  })
}

// ─── Consumers (idempotent) ──────────────────────────────────────────────────

/** `payment.funded` → FUNDED → IN_PROGRESS. Replays are no-ops. */
export async function onPaymentFunded(event: EventEnvelope) {
  const { dealId, intentId } = event.payload as { dealId: string; intentId?: string }
  await prisma.$transaction(async (tx) => {
    const deal = await lockDeal(tx, dealId).catch(() => null)
    if (!deal) return log.warn({ dealId }, "payment.funded for unknown deal")
    const data = { intentId: intentId ?? null, eventId: event.id }
    if (deal.status === "CONTRACT_SIGNED") await transitionDeal(tx, deal, "FUND", "SYSTEM", { actorId: null, data, payload: data })
    if (deal.status === "FUNDED") await transitionDeal(tx, deal, "START", "SYSTEM", { actorId: null, data, payload: data })
    else if (!["IN_PROGRESS", "COMPLETED", "DISPUTED"].includes(deal.status)) log.error({ dealId, status: deal.status }, "escrow funded for a deal that cannot be funded; needs admin refund")
  })
}

export async function onMilestoneReleased(event: EventEnvelope) {
  const p = event.payload as { dealId: string; milestoneId: string; payoutId?: string; gross?: number; net?: number }
  await applyMilestoneSettlement({ dealId: p.dealId, milestoneId: p.milestoneId, kind: "RELEASE", payoutId: p.payoutId, gross: p.gross, net: p.net })
}

export async function onPaymentRefunded(event: EventEnvelope) {
  const p = event.payload as { dealId: string; milestoneId?: string | null; amount?: number; partial?: boolean }
  if (!p.milestoneId) return
  await applyMilestoneSettlement({ dealId: p.dealId, milestoneId: p.milestoneId, kind: "REFUND", partial: !!p.partial, amount: p.amount })
}

// ─── Internal ────────────────────────────────────────────────────────────────

export async function internalDeal(id: string): Promise<InternalDealDTO> {
  const d = await prisma.deal.findUnique({ where: { id }, include: { brand: { select: { userId: true } }, creator: { select: { userId: true } }, milestones: { orderBy: { position: "asc" } } } })
  if (!d) throw errors.notFound("Deal")
  return {
    id: d.id,
    title: d.title,
    status: d.status,
    amount: d.amount,
    currency: d.currency,
    paymentMode: d.paymentMode,
    brandId: d.brandId,
    creatorId: d.creatorId,
    brandUserId: d.brand.userId,
    creatorUserId: d.creator.userId,
    briefId: d.briefId,
    holdUntil: d.holdUntil?.toISOString() ?? null,
    feeRates: { brand: d.brandFeeRate, creator: d.creatorFeeRate, processing: d.processingFeeRate },
    milestones: d.milestones.map((m) => ({ id: m.id, position: m.position, title: m.title, amount: m.amount, status: m.status, dueDate: m.dueDate?.toISOString() ?? null, submittedAt: m.submittedAt?.toISOString() ?? null })),
    createdAt: d.createdAt.toISOString(),
    completedAt: d.completedAt?.toISOString() ?? null,
  }
}

export async function participants(id: string): Promise<DealParticipantsDTO> {
  const d = await prisma.deal.findUnique({ where: { id }, select: { id: true, brandId: true, creatorId: true, brand: { select: { userId: true } }, creator: { select: { userId: true } } } })
  if (!d) throw errors.notFound("Deal")
  return { dealId: d.id, brandId: d.brandId, creatorId: d.creatorId, brandUserId: d.brand.userId, creatorUserId: d.creator.userId }
}
