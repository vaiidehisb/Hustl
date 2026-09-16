// Subscription entitlements. payment-service owns the money and the subscription
// rows; it never writes profiles. user-service is the only writer of
// `BrandProfile.plan` and the paid-badge columns, and it applies them from the
// `subscription.*` events (see backend/API.md → Entitlements).
//
// Handlers are idempotent: every event carries the full subscription state, so
// replaying one lands on the same profile values.

import { createLogger, publish, TOPICS, type EventEnvelope, type Topic } from "@hustl/common"
import { BADGE_TIERS, BRAND_PLANS, type BadgeTier, type BrandPlanName } from "@hustl/contracts"
import { prisma } from "@hustl/db"

const log = createLogger("user-service:entitlements")

export const ENTITLEMENT_TOPICS: Topic[] = [
  TOPICS.SUBSCRIPTION_ACTIVATED,
  TOPICS.SUBSCRIPTION_RENEWED,
  TOPICS.SUBSCRIPTION_CANCELLED,
  TOPICS.SUBSCRIPTION_EXPIRED,
  TOPICS.SUBSCRIPTION_PAYMENT_FAILED,
]

type Payload = Record<string, unknown>

const str = (p: Payload, key: string) => (typeof p[key] === "string" && p[key] ? (p[key] as string) : null)
const date = (p: Payload, key: string) => {
  const v = str(p, key)
  const d = v ? new Date(v) : null
  return d && !Number.isNaN(d.getTime()) ? d : null
}
const brandPlanOf = (p: Payload): BrandPlanName | null => {
  const v = str(p, "brandPlan")
  return v && (BRAND_PLANS as readonly string[]).includes(v) ? (v as BrandPlanName) : null
}
const badgeTierOf = (p: Payload): BadgeTier | null => {
  const v = str(p, "badgeTier")
  return v && (BADGE_TIERS as readonly string[]).includes(v) ? (v as BadgeTier) : null
}

/** Grant: the plan/badge the product sells, valid to the end of the paid period. */
async function grant(p: Payload) {
  const periodEnd = date(p, "currentPeriodEnd")
  const brandId = str(p, "brandId")
  const creatorId = str(p, "creatorId")
  const plan = brandPlanOf(p)
  const badge = badgeTierOf(p)

  if (brandId && plan) {
    const brand = await prisma.brandProfile.findUnique({ where: { id: brandId }, select: { id: true, userId: true, plan: true } })
    if (!brand) return "brand_not_found"
    if (brand.plan === plan) return "unchanged"
    await prisma.$transaction(async (tx) => {
      await tx.brandProfile.update({ where: { id: brand.id }, data: { plan } })
      await publish(tx, TOPICS.BRAND_PROFILE_UPDATED, brand.id, { brandId: brand.id, userId: brand.userId, plan, reason: "SUBSCRIPTION" })
    })
    return `brand_plan_${plan.toLowerCase()}`
  }

  if (creatorId && badge) {
    const creator = await prisma.creatorProfile.findUnique({ where: { id: creatorId }, select: { id: true, userId: true, badgeTier: true, badgeUntil: true } })
    if (!creator) return "creator_not_found"
    // A higher tier bought alongside a lower one wins; never shorten an existing badge.
    const keepTier = creator.badgeTier === "PRIORITY" && badge === "STANDARD" && creator.badgeUntil && creator.badgeUntil > new Date()
    const tier = keepTier ? creator.badgeTier! : badge
    const until = periodEnd && (!creator.badgeUntil || periodEnd > creator.badgeUntil || !keepTier) ? periodEnd : creator.badgeUntil
    if (creator.badgeTier === tier && creator.badgeUntil?.getTime() === until?.getTime()) return "unchanged"
    await prisma.$transaction(async (tx) => {
      await tx.creatorProfile.update({ where: { id: creator.id }, data: { badgeTier: tier, badgeUntil: until } })
      // Keeps the creator's search document (badge placement) fresh.
      await publish(tx, TOPICS.CREATOR_PROFILE_UPDATED, creator.id, { creatorId: creator.id, userId: creator.userId, badgeTier: tier, reason: "SUBSCRIPTION" })
    })
    return `creator_badge_${tier.toLowerCase()}`
  }
  return "no_entitlement"
}

/** Revoke: the paid period is over. Brands fall back to STARTER, creators lose the badge. */
async function revoke(p: Payload) {
  const brandId = str(p, "brandId")
  const creatorId = str(p, "creatorId")
  const plan = brandPlanOf(p)
  const badge = badgeTierOf(p)

  if (brandId && plan) {
    const brand = await prisma.brandProfile.findUnique({ where: { id: brandId }, select: { id: true, userId: true, plan: true } })
    if (!brand) return "brand_not_found"
    // Only drop the plan this subscription paid for (an Enterprise grant outlives a lapsed Growth plan).
    if (brand.plan !== plan) return "unchanged"
    await prisma.$transaction(async (tx) => {
      await tx.brandProfile.update({ where: { id: brand.id }, data: { plan: "STARTER" } })
      await publish(tx, TOPICS.BRAND_PROFILE_UPDATED, brand.id, { brandId: brand.id, userId: brand.userId, plan: "STARTER", reason: "SUBSCRIPTION_ENDED" })
    })
    return "brand_plan_starter"
  }

  if (creatorId && badge) {
    const creator = await prisma.creatorProfile.findUnique({ where: { id: creatorId }, select: { id: true, userId: true, badgeTier: true, badgeUntil: true } })
    if (!creator) return "creator_not_found"
    if (creator.badgeTier !== badge) return "unchanged"
    await prisma.$transaction(async (tx) => {
      await tx.creatorProfile.update({ where: { id: creator.id }, data: { badgeTier: null, badgeUntil: null } })
      await publish(tx, TOPICS.CREATOR_PROFILE_UPDATED, creator.id, { creatorId: creator.id, userId: creator.userId, badgeTier: null, reason: "SUBSCRIPTION_ENDED" })
    })
    return "creator_badge_cleared"
  }
  return "no_entitlement"
}

/** Applies one subscription event to the subscriber's profile. Idempotent. */
export async function handleSubscriptionEvent(event: EventEnvelope): Promise<string> {
  const p = (event.payload ?? {}) as Payload
  switch (event.topic) {
    case TOPICS.SUBSCRIPTION_ACTIVATED:
    case TOPICS.SUBSCRIPTION_RENEWED:
      return grant(p)
    case TOPICS.SUBSCRIPTION_EXPIRED:
      return revoke(p)
    // Cancelling keeps access to the end of the paid period; the expiry sweep revokes it.
    // A failed payment keeps access while the provider retries (status PAST_DUE).
    case TOPICS.SUBSCRIPTION_CANCELLED:
    case TOPICS.SUBSCRIPTION_PAYMENT_FAILED:
      return "no_change"
    default:
      return "ignored"
  }
}

export async function consumeSubscriptionEvent(event: EventEnvelope) {
  const outcome = await handleSubscriptionEvent(event)
  log.info({ eventId: event.id, topic: event.topic, subscriptionId: event.key, outcome }, "subscription entitlement applied")
}
