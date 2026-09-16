import { errors, publish, TOPICS, type AuthUser, type Topic } from "@hustl/common"
import type { DealAction, DealStatus } from "@hustl/contracts"
import { Prisma } from "@hustl/db"
import { assertTransition, type Actor } from "../domain/deal-machine"

export type Tx = Prisma.TransactionClient
export type PartyName = "BRAND" | "CREATOR"

export const dealWithParties = {
  brand: { include: { user: { select: { id: true, name: true, kycStatus: true, createdAt: true } } } },
  creator: { include: { user: { select: { id: true, name: true } }, score: { select: { reliabilityScore: true, trustScore: true } } } },
  milestones: { orderBy: { position: "asc" } },
} satisfies Prisma.DealInclude
export type DealWithParties = Prisma.DealGetPayload<{ include: typeof dealWithParties }>

/** Loads the deal with a row lock held until the transaction ends (serialises concurrent actions). */
export async function lockDeal(tx: Tx, dealId: string): Promise<DealWithParties> {
  await tx.$queryRaw`SELECT id FROM deals WHERE id = ${dealId}::uuid FOR UPDATE`
  const deal = await tx.deal.findUnique({ where: { id: dealId }, include: dealWithParties })
  if (!deal) throw errors.notFound("Deal")
  return deal
}

type PartyDeal = { brand: { userId: string }; creator: { userId: string } }

export function partyOf(deal: PartyDeal, user: AuthUser, opts: { allowAdmin?: boolean } = {}): PartyName | "ADMIN" {
  if (deal.brand.userId === user.id) return "BRAND"
  if (deal.creator.userId === user.id) return "CREATOR"
  if (opts.allowAdmin && user.role === "ADMIN") return "ADMIN"
  throw errors.forbidden("You are not a party to this deal")
}

export function requireParty(deal: PartyDeal, user: AuthUser): PartyName {
  return partyOf(deal, user) as PartyName
}

export const otherParty = (p: PartyName): PartyName => (p === "BRAND" ? "CREATOR" : "BRAND")

export const partiesPayload = (deal: { id: string; brandId: string; creatorId: string; brand: { userId: string }; creator: { userId: string } }) => ({
  dealId: deal.id,
  brandId: deal.brandId,
  creatorId: deal.creatorId,
  brandUserId: deal.brand.userId,
  creatorUserId: deal.creator.userId,
})

const ACTION_TOPICS: Partial<Record<DealAction, Topic>> = {
  COUNTER: TOPICS.OFFER_COUNTERED,
  ACCEPT: TOPICS.OFFER_ACCEPTED,
  DECLINE: TOPICS.OFFER_DECLINED,
  SIGN: TOPICS.CONTRACT_SIGNED,
  FUND: TOPICS.DEAL_FUNDED,
  COMPLETE: TOPICS.DEAL_COMPLETED,
}

/**
 * Applies a state-machine transition inside `tx`: guarded status update, a
 * deal_events row, the action's topic and `deal.status_changed` — all atomic.
 */
export async function transitionDeal(
  tx: Tx,
  deal: DealWithParties,
  action: DealAction,
  actor: Actor,
  opts: { actorId: string | null; update?: Prisma.DealUpdateManyMutationInput; data?: Record<string, unknown>; payload?: Record<string, unknown> } = { actorId: null },
): Promise<DealStatus> {
  const from = deal.status
  const to = assertTransition(from, action, actor)
  const now = new Date()
  const res = await tx.deal.updateMany({
    where: { id: deal.id, status: from },
    data: { ...opts.update, status: to, ...(to === "COMPLETED" && { completedAt: now }), ...(to === "CANCELLED" && { cancelledAt: now }) },
  })
  if (res.count === 0) throw errors.conflict("The deal changed while you were acting on it — reload and retry", { from, action })
  await tx.dealEvent.create({
    data: { dealId: deal.id, actorId: opts.actorId, type: action, fromStatus: from, toStatus: to, data: (opts.data ?? {}) as Prisma.InputJsonValue },
  })
  const payload = { ...partiesPayload(deal), title: deal.title, amount: deal.amount, action, actor, actorId: opts.actorId, from, to, ...opts.payload }
  const topic = ACTION_TOPICS[action]
  if (topic) await publish(tx, topic, deal.id, payload)
  if (from !== to) await publish(tx, TOPICS.DEAL_STATUS_CHANGED, deal.id, payload)
  deal.status = to
  return to
}

export async function recordDealEvent(tx: Tx, dealId: string, type: string, actorId: string | null, data: Record<string, unknown> = {}) {
  await tx.dealEvent.create({ data: { dealId, actorId, type, data: data as Prisma.InputJsonValue } })
}
