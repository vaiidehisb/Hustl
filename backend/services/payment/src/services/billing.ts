// Subscription billing: the Brand Growth plan and the paid Verified Creator badge.
//
// payment-service owns money and subscriptions only. It never writes brand_profiles
// or creator_profiles — entitlements are applied by user-service from the
// subscription.* events published here (see backend/API.md → Entitlements).

import { randomUUID } from "node:crypto"
import { createLogger, errors, pageMeta, publish, TOPICS, type AuthUser, type Topic } from "@hustl/common"
import {
  brandFeeRateForPlan,
  PLAN_CATALOG,
  planProduct,
  type AdminGrantSubscriptionRequest,
  type AdminSubscriptionsQuery,
  type BillingProductsResponse,
  type BillingSubscriptionResponse,
  type BrandPlanName,
  type CancelSubscriptionResponse,
  type ConfirmTestSubscriptionResponse,
  type ExpireSubscriptionsResult,
  type SubscribeRequest,
  type SubscribeResponse,
  type SubscriptionCheckoutDetails,
  type SubscriptionProductKey,
} from "@hustl/contracts"
import { prisma, Prisma, type PaymentProvider, type Subscription, type SubscriptionProvider } from "@hustl/db"
import { addInterval, ENTITLED_STATUSES, isEntitled, nextPeriod, requireProduct } from "../domain/billing"
import { toSubscriptionDTO, toSubscriptionInvoiceDTO } from "../lib/dto"
import { activeProvider, getProvider, providerNameFromEnv, TestAdapter, type NormalizedWebhookEvent } from "../providers"

const log = createLogger("payment-service:billing")

type Tx = Prisma.TransactionClient

// ─── Subscriber resolution ───────────────────────────────────────────────────

type Subscriber = { subscriberType: "BRAND" | "CREATOR"; brandId: string | null; creatorId: string | null; userId: string; email: string; name: string; ref: string }

const subscriberWhere = (s: { brandId: string | null; creatorId: string | null }) =>
  s.brandId ? { brandId: s.brandId } : { creatorId: s.creatorId! }

async function brandSubscriber(userId: string): Promise<Subscriber | null> {
  const brand = await prisma.brandProfile.findUnique({ where: { userId }, include: { user: { select: { id: true, email: true, name: true } } } })
  return brand && !brand.deletedAt
    ? { subscriberType: "BRAND", brandId: brand.id, creatorId: null, userId: brand.user.id, email: brand.user.email, name: brand.companyName || brand.user.name, ref: brand.id }
    : null
}

async function creatorSubscriber(userId: string): Promise<Subscriber | null> {
  const creator = await prisma.creatorProfile.findUnique({ where: { userId }, include: { user: { select: { id: true, email: true, name: true } } } })
  return creator && !creator.deletedAt
    ? { subscriberType: "CREATOR", brandId: null, creatorId: creator.id, userId: creator.user.id, email: creator.user.email, name: creator.user.name || `@${creator.handle}`, ref: creator.id }
    : null
}

/** The caller's subscriber identity for `audience`. Role and profile are both required. */
async function requireSubscriber(user: AuthUser, audience: "BRAND" | "CREATOR"): Promise<Subscriber> {
  if (user.role !== audience)
    throw errors.forbidden(audience === "BRAND" ? "Only a brand account can buy a brand plan" : "Only a creator account can buy a creator product")
  const s = audience === "BRAND" ? await brandSubscriber(user.id) : await creatorSubscriber(user.id)
  if (!s) throw errors.forbidden(`${audience === "BRAND" ? "Brand" : "Creator"} profile required`)
  return s
}

/** Whichever profile the caller has (brands and creators both read their own billing). */
async function callerSubscriber(user: AuthUser): Promise<Subscriber | null> {
  if (user.role === "BRAND") return brandSubscriber(user.id)
  if (user.role === "CREATOR") return creatorSubscriber(user.id)
  return (await brandSubscriber(user.id)) ?? (await creatorSubscriber(user.id))
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listProducts(user: AuthUser): Promise<BillingProductsResponse> {
  const subscriber = await callerSubscriber(user)
  const owned = subscriber
    ? await prisma.subscription.findMany({ where: { ...subscriberWhere(subscriber), status: { in: [...ENTITLED_STATUSES] } } })
    : []
  const audience = user.role === "ADMIN" ? ("ADMIN" as const) : (subscriber?.subscriberType ?? null)
  const visible = PLAN_CATALOG.filter((p) => audience === "ADMIN" || audience === null || p.audience === audience)
  return {
    audience,
    currency: "INR",
    products: visible.map((p) => {
      const mine = owned.find((s) => s.product === p.key && isEntitled(s))
      return { ...p, owned: !!mine, ownedSubscriptionId: mine?.id ?? null }
    }),
  }
}

export async function mySubscriptions(user: AuthUser): Promise<BillingSubscriptionResponse> {
  const subscriber = await callerSubscriber(user)
  if (!subscriber) throw errors.forbidden("A brand or creator profile is required")
  const subscriptions = await prisma.subscription.findMany({ where: subscriberWhere(subscriber), orderBy: { createdAt: "desc" } })
  const invoices = subscriptions.length
    ? await prisma.subscriptionInvoice.findMany({ where: { subscriptionId: { in: subscriptions.map((s) => s.id) } }, orderBy: { createdAt: "desc" }, take: 100 })
    : []
  return { subscriptions: subscriptions.map(toSubscriptionDTO), invoices: invoices.map(toSubscriptionInvoiceDTO), entitlements: entitlementsOf(subscriptions) }
}

/** What the active subscriptions currently grant. The same rules user-service applies. */
export function entitlementsOf(subscriptions: Subscription[]): BillingSubscriptionResponse["entitlements"] {
  const active = subscriptions.filter((s) => isEntitled(s))
  const brandPlans = active.map((s) => planProduct(s.product)?.brandPlan).filter((p): p is BrandPlanName => !!p)
  const brandPlan = brandPlans.includes("ENTERPRISE") ? "ENTERPRISE" : (brandPlans[0] ?? null)
  const badge = active
    .map((s) => ({ tier: planProduct(s.product)?.badgeTier ?? null, until: s.currentPeriodEnd }))
    .filter((b): b is { tier: "STANDARD" | "PRIORITY"; until: Date } => !!b.tier)
    .sort((a, b) => (a.tier === "PRIORITY" ? -1 : b.tier === "PRIORITY" ? 1 : 0))[0]
  return {
    brandPlan,
    brandFeeRate: brandPlan ? brandFeeRateForPlan(brandPlan) : null,
    badgeTier: badge?.tier ?? null,
    badgeUntil: badge?.until.toISOString() ?? null,
  }
}

// ─── Subscribe ───────────────────────────────────────────────────────────────

function checkoutFor(sub: Subscription): SubscriptionCheckoutDetails | null {
  if (!sub.providerSubscriptionId || sub.provider === "MANUAL") return null
  return getProvider(sub.provider as PaymentProvider).subscriptionCheckoutFor({
    id: sub.id,
    providerSubscriptionId: sub.providerSubscriptionId,
    checkoutRef: sub.providerCheckoutRef,
    priceAmount: sub.priceAmount,
    currency: sub.currency,
  })
}

export async function subscribe(user: AuthUser, body: SubscribeRequest): Promise<SubscribeResponse> {
  const product = requireProduct(body.product)
  if (!product.selfServe || product.price === null) throw errors.conflict(`${product.name} is not self-serve — contact sales`, { product: product.key })
  const subscriber = await requireSubscriber(user, product.audience)

  const existing = await prisma.subscription.findMany({ where: { ...subscriberWhere(subscriber), product: product.key }, orderBy: { createdAt: "desc" } })
  const active = existing.find((s) => isEntitled(s))
  if (active) throw errors.conflict(`You already have ${product.name}`, { subscriptionId: active.id, currentPeriodEnd: active.currentPeriodEnd.toISOString(), status: active.status })

  const providerName = providerNameFromEnv()
  // An unfinished attempt with the same provider is reused, so retrying checkout never double-charges.
  const pending = existing.find((s) => s.status === "PENDING" && s.provider === (providerName as SubscriptionProvider) && s.priceAmount === product.price && s.providerSubscriptionId)
  if (pending) return { subscription: toSubscriptionDTO(pending), checkout: checkoutFor(pending), alreadyActive: false }

  const id = randomUUID()
  const now = new Date()
  const adapter = activeProvider()
  const res = await adapter.createSubscription({
    subscriptionId: id,
    product: product.key,
    amount: product.price,
    currency: "INR",
    interval: product.interval,
    subscriberRef: subscriber.ref,
    email: subscriber.email,
    name: subscriber.name,
    description: `hustl. ${product.name}`,
    idempotencyKey: `sub:${id}`,
  })
  const created = await prisma.subscription.create({
    data: {
      id,
      subscriberType: subscriber.subscriberType,
      brandId: subscriber.brandId,
      creatorId: subscriber.creatorId,
      product: product.key,
      status: "PENDING",
      provider: adapter.name as SubscriptionProvider,
      providerSubscriptionId: res.providerSubscriptionId,
      providerCheckoutRef: res.checkoutRef,
      priceAmount: product.price,
      interval: product.interval,
      currentPeriodStart: res.currentPeriodStart ?? now,
      currentPeriodEnd: res.currentPeriodEnd ?? addInterval(res.currentPeriodStart ?? now, product.interval),
    },
  })
  return { subscription: toSubscriptionDTO(created), checkout: res.checkout, alreadyActive: false }
}

// ─── Cancel ──────────────────────────────────────────────────────────────────

async function ownedSubscription(user: AuthUser, id: string) {
  const sub = await prisma.subscription.findUnique({
    where: { id },
    include: { brand: { select: { userId: true } }, creator: { select: { userId: true } } },
  })
  if (!sub) throw errors.notFound("Subscription")
  const ownerId = sub.brand?.userId ?? sub.creator?.userId
  if (ownerId !== user.id && user.role !== "ADMIN") throw errors.forbidden("This subscription belongs to another account")
  return sub
}

export async function cancelSubscription(user: AuthUser, id: string): Promise<CancelSubscriptionResponse> {
  const sub = await ownedSubscription(user, id)
  if (sub.status === "EXPIRED" || sub.status === "CANCELLED") throw errors.conflict("This subscription is already closed", { status: sub.status })
  if (sub.cancelAtPeriodEnd) return { subscription: toSubscriptionDTO(sub), accessUntil: sub.currentPeriodEnd.toISOString() }

  if (sub.providerSubscriptionId && sub.provider !== "MANUAL")
    await getProvider(sub.provider as PaymentProvider).cancelSubscription({ providerSubscriptionId: sub.providerSubscriptionId, atPeriodEnd: sub.status !== "PENDING" })

  const updated = await prisma.$transaction(async (tx) => {
    // Never activated: nothing to keep, close it now. Otherwise access runs to the end of the paid period.
    const closeNow = sub.status === "PENDING"
    const row = await tx.subscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: true, cancelledAt: new Date(), ...(closeNow && { status: "CANCELLED", currentPeriodEnd: new Date() }) },
    })
    await publishSubscriptionEvent(tx, TOPICS.SUBSCRIPTION_CANCELLED, row, { userId: sub.brand?.userId ?? sub.creator?.userId ?? null, cancelledBy: user.id === (sub.brand?.userId ?? sub.creator?.userId) ? "SUBSCRIBER" : "ADMIN" })
    return row
  })
  return { subscription: toSubscriptionDTO(updated), accessUntil: updated.currentPeriodEnd.toISOString() }
}

// ─── Sandbox confirmation (same code path as a provider webhook) ─────────────

export async function confirmTestSubscription(user: AuthUser, id: string): Promise<ConfirmTestSubscriptionResponse> {
  // Belt and braces: the sandbox provider is refused at boot in production too.
  if (process.env.NODE_ENV === "production") throw errors.forbidden("confirm-test is not available in production")
  const sub = await ownedSubscription(user, id)
  if (sub.provider !== "TEST") throw errors.conflict("confirm-test is only available for test-provider subscriptions", { provider: sub.provider })
  if (!sub.providerSubscriptionId) throw errors.conflict("Subscription has no provider reference")
  if (sub.status === "CANCELLED" || sub.status === "EXPIRED") throw errors.conflict("This subscription is closed", { status: sub.status })

  const period = nextPeriod(sub)
  const sequence = await prisma.subscriptionInvoice.count({ where: { subscriptionId: sub.id } })
  const adapter = getProvider("TEST") as TestAdapter
  const event = adapter.subscriptionPaidEvent({
    id: sub.id,
    providerSubscriptionId: sub.providerSubscriptionId,
    priceAmount: sub.priceAmount,
    periodStart: period.start,
    periodEnd: period.end,
    sequence,
  })
  const { processProviderEvent } = await import("./funding")
  const result = await processProviderEvent("TEST", event, { simulated: true, subscriptionId: sub.id })
  const [fresh, invoice] = await Promise.all([
    prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } }),
    prisma.subscriptionInvoice.findFirst({ where: { subscriptionId: sub.id }, orderBy: { createdAt: "desc" } }),
  ])
  return { subscription: toSubscriptionDTO(fresh), invoice: invoice ? toSubscriptionInvoiceDTO(invoice) : null, duplicate: result.duplicate, outcome: result.outcome }
}

// ─── Provider events (called from processProviderEvent, inside its transaction) ─

type SubscriptionWithOwner = Prisma.SubscriptionGetPayload<{ include: { brand: { select: { userId: true } }; creator: { select: { userId: true } } } }>

const ownerInclude = { brand: { select: { userId: true } }, creator: { select: { userId: true } } } as const

const findByProviderRef = (tx: Tx, provider: SubscriptionProvider, providerSubscriptionId: string) =>
  tx.subscription.findFirst({ where: { provider, providerSubscriptionId }, include: ownerInclude })

/** Event payload: everything a consumer (entitlements, notifications) needs without another lookup. */
function subscriptionPayload(sub: Subscription, extra: Record<string, unknown> = {}) {
  const product = planProduct(sub.product)
  return {
    subscriptionId: sub.id,
    subscriberType: sub.subscriberType,
    brandId: sub.brandId,
    creatorId: sub.creatorId,
    product: sub.product,
    productName: product?.name ?? sub.product,
    brandPlan: product?.brandPlan ?? null,
    badgeTier: product?.badgeTier ?? null,
    amount: sub.priceAmount,
    currency: sub.currency,
    interval: sub.interval,
    status: sub.status,
    provider: sub.provider,
    currentPeriodStart: sub.currentPeriodStart.toISOString(),
    currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    ...extra,
  }
}

async function publishSubscriptionEvent(tx: Tx, topic: Topic, sub: Subscription, extra: Record<string, unknown> = {}) {
  await publish(tx, topic, sub.id, subscriptionPayload(sub, extra))
}

const ownerIdOf = (sub: SubscriptionWithOwner) => sub.brand?.userId ?? sub.creator?.userId ?? null

async function recordInvoice(
  tx: Tx,
  sub: Subscription,
  invoice: { providerInvoiceId: string | null; amountMinor: number | null; periodStart: Date | null; periodEnd: Date | null } | null,
  period: { start: Date; end: Date },
  status: "PAID" | "FAILED",
  failureReason?: string,
) {
  const amount = invoice?.amountMinor != null ? Math.round(invoice.amountMinor / 100) : sub.priceAmount
  const data = {
    subscriptionId: sub.id,
    amount,
    currency: sub.currency,
    status,
    provider: sub.provider,
    providerInvoiceId: invoice?.providerInvoiceId ?? null,
    periodStart: invoice?.periodStart ?? period.start,
    periodEnd: invoice?.periodEnd ?? period.end,
    paidAt: status === "PAID" ? new Date() : null,
    failureReason: failureReason?.slice(0, 500) ?? null,
  }
  if (!data.providerInvoiceId) return tx.subscriptionInvoice.create({ data })
  return tx.subscriptionInvoice.upsert({
    where: { provider_providerInvoiceId: { provider: sub.provider, providerInvoiceId: data.providerInvoiceId } },
    create: data,
    update: { status: data.status, paidAt: data.paidAt, failureReason: data.failureReason, amount: data.amount, periodStart: data.periodStart, periodEnd: data.periodEnd },
  })
}

/** A billing period was paid for: first activation or a renewal. Idempotent. */
export async function applySubscriptionPaid(tx: Tx, provider: PaymentProvider, event: Extract<NormalizedWebhookEvent, { kind: "subscription.paid" }>) {
  const sub = await findByProviderRef(tx, provider as SubscriptionProvider, event.providerSubscriptionId)
  if (!sub) return "unknown_subscription"

  const renewal = (ENTITLED_STATUSES as readonly string[]).includes(sub.status)
  const fallback = nextPeriod(sub)
  const start = event.periodStart ?? fallback.start
  const end = event.periodEnd ?? addInterval(start, sub.interval)
  // A repeated notification for a period we already granted must not extend access.
  if (renewal && end.getTime() <= sub.currentPeriodEnd.getTime() && !sub.cancelAtPeriodEnd) {
    await recordInvoice(tx, sub, event.invoice, { start, end }, "PAID")
    return "already_current"
  }

  // Defensive: the partial unique index allows exactly one live subscription per subscriber per product.
  const conflict = await tx.subscription.findFirst({
    where: {
      id: { not: sub.id },
      product: sub.product,
      status: { in: [...ENTITLED_STATUSES] },
      ...(sub.brandId ? { brandId: sub.brandId } : { creatorId: sub.creatorId }),
    },
  })
  if (conflict) {
    const closed = await tx.subscription.update({ where: { id: conflict.id }, data: { status: "EXPIRED" } })
    await publishSubscriptionEvent(tx, TOPICS.SUBSCRIPTION_EXPIRED, closed, { userId: ownerIdOf(sub), reason: "SUPERSEDED" })
  }

  const updated = await tx.subscription.update({
    where: { id: sub.id },
    data: { status: "ACTIVE", currentPeriodStart: start, currentPeriodEnd: end, ...(renewal ? {} : { cancelAtPeriodEnd: false, cancelledAt: null }) },
  })
  const invoice = await recordInvoice(tx, updated, event.invoice, { start, end }, "PAID")
  await publishSubscriptionEvent(tx, renewal ? TOPICS.SUBSCRIPTION_RENEWED : TOPICS.SUBSCRIPTION_ACTIVATED, updated, {
    userId: ownerIdOf(sub),
    invoiceId: invoice.id,
    invoiceAmount: invoice.amount,
  })
  return renewal ? "renewed" : "activated"
}

export async function applySubscriptionPaymentFailed(tx: Tx, provider: PaymentProvider, event: Extract<NormalizedWebhookEvent, { kind: "subscription.payment_failed" }>) {
  const sub = await findByProviderRef(tx, provider as SubscriptionProvider, event.providerSubscriptionId)
  if (!sub) return "unknown_subscription"
  if (sub.status === "CANCELLED" || sub.status === "EXPIRED") return "no_change"
  // PAST_DUE keeps access during the provider's retry window; the sweep expires it when the period runs out.
  const updated = await tx.subscription.update({ where: { id: sub.id }, data: { status: "PAST_DUE" } })
  const invoice = await recordInvoice(tx, updated, event.invoice, { start: updated.currentPeriodStart, end: updated.currentPeriodEnd }, "FAILED", event.reason)
  await publishSubscriptionEvent(tx, TOPICS.SUBSCRIPTION_PAYMENT_FAILED, updated, {
    userId: ownerIdOf(sub),
    invoiceId: invoice.id,
    reason: event.reason.slice(0, 500),
  })
  return "payment_failed"
}

export async function applySubscriptionCancelled(tx: Tx, provider: PaymentProvider, event: Extract<NormalizedWebhookEvent, { kind: "subscription.cancelled" }>) {
  const sub = await findByProviderRef(tx, provider as SubscriptionProvider, event.providerSubscriptionId)
  if (!sub) return "unknown_subscription"
  if (sub.status === "CANCELLED" || sub.status === "EXPIRED") return "no_change"
  if (sub.cancelAtPeriodEnd && sub.cancelledAt) return "already_cancelled"
  const closeNow = sub.status === "PENDING"
  const updated = await tx.subscription.update({
    where: { id: sub.id },
    data: { cancelAtPeriodEnd: true, cancelledAt: event.at ?? new Date(), ...(closeNow && { status: "CANCELLED", currentPeriodEnd: new Date() }) },
  })
  await publishSubscriptionEvent(tx, TOPICS.SUBSCRIPTION_CANCELLED, updated, { userId: ownerIdOf(sub), cancelledBy: "PROVIDER" })
  return "cancelled"
}

// ─── Renewal / expiry sweep ──────────────────────────────────────────────────

/**
 * Marks live subscriptions EXPIRED once their paid period has run out without a
 * renewal. user-service reacts to `subscription.expired` by dropping the brand
 * back to STARTER and clearing the paid badge.
 */
export async function expireSubscriptions(now = new Date()): Promise<ExpireSubscriptionsResult> {
  const due = await prisma.subscription.findMany({
    where: { status: { in: [...ENTITLED_STATUSES] }, currentPeriodEnd: { lte: now } },
    include: ownerInclude,
    take: 500,
  })
  const ids: string[] = []
  for (const sub of due) {
    try {
      await prisma.$transaction(async (tx) => {
        // Re-read inside the transaction: a renewal webhook may have landed in between.
        const claimed = await tx.subscription.updateMany({
          where: { id: sub.id, status: { in: [...ENTITLED_STATUSES] }, currentPeriodEnd: { lte: now } },
          data: { status: "EXPIRED" },
        })
        if (claimed.count === 0) return
        const row = await tx.subscription.findUniqueOrThrow({ where: { id: sub.id } })
        await publishSubscriptionEvent(tx, TOPICS.SUBSCRIPTION_EXPIRED, row, {
          userId: ownerIdOf(sub),
          reason: sub.cancelAtPeriodEnd ? "CANCELLED_AT_PERIOD_END" : "NOT_RENEWED",
        })
        ids.push(sub.id)
      })
    } catch (err) {
      log.error({ err, subscriptionId: sub.id }, "failed to expire subscription")
    }
  }
  if (ids.length) log.info({ count: ids.length }, "subscriptions expired")
  return { expired: ids.length, ids }
}

/** Runs the sweep on an interval. Returns a stop function. */
export function startExpirySweep(intervalMs = 15 * 60_000) {
  let stopped = false
  const tick = async () => {
    if (stopped) return
    await expireSubscriptions().catch((err) => log.error({ err }, "subscription expiry sweep failed"))
  }
  const timer = setInterval(tick, intervalMs)
  timer.unref?.()
  void tick()
  return () => {
    stopped = true
    clearInterval(timer)
  }
}

// ─── Admin ───────────────────────────────────────────────────────────────────

/** Grant or replace a plan: Enterprise, comps and support fixes. Recorded as a MANUAL subscription. */
export async function adminGrantSubscription(admin: AuthUser, body: AdminGrantSubscriptionRequest): Promise<SubscribeResponse> {
  const product = requireProduct(body.product)
  if (product.audience !== body.subscriberType) throw errors.badRequest(`${product.name} is a ${product.audience.toLowerCase()} product`)

  const owner =
    body.subscriberType === "BRAND"
      ? await prisma.brandProfile.findUnique({ where: { id: body.brandId! }, select: { id: true, userId: true } })
      : await prisma.creatorProfile.findUnique({ where: { id: body.creatorId! }, select: { id: true, userId: true } })
  if (!owner) throw errors.notFound(body.subscriberType === "BRAND" ? "Brand" : "Creator")

  const now = new Date()
  const end = body.periodDays ? new Date(now.getTime() + body.periodDays * 86_400_000) : addInterval(now, product.interval)
  const where = body.subscriberType === "BRAND" ? { brandId: owner.id } : { creatorId: owner.id }

  const created = await prisma.$transaction(async (tx) => {
    // One live subscription per subscriber per product (enforced by a partial unique index too).
    const live = await tx.subscription.findMany({ where: { ...where, product: product.key, status: { in: [...ENTITLED_STATUSES] } } })
    for (const old of live) {
      const closed = await tx.subscription.update({ where: { id: old.id }, data: { status: "EXPIRED" } })
      await publishSubscriptionEvent(tx, TOPICS.SUBSCRIPTION_EXPIRED, closed, { userId: owner.userId, reason: "SUPERSEDED" })
    }
    const row = await tx.subscription.create({
      data: {
        subscriberType: body.subscriberType,
        brandId: body.subscriberType === "BRAND" ? owner.id : null,
        creatorId: body.subscriberType === "CREATOR" ? owner.id : null,
        product: product.key,
        status: "ACTIVE",
        provider: "MANUAL",
        priceAmount: body.priceAmount ?? product.price ?? 0,
        interval: product.interval,
        currentPeriodStart: now,
        currentPeriodEnd: end,
        grantedById: admin.id,
        note: body.note ?? null,
      },
    })
    await publishSubscriptionEvent(tx, TOPICS.SUBSCRIPTION_ACTIVATED, row, { userId: owner.userId, grantedByAdminId: admin.id })
    return row
  })
  log.info({ admin: admin.id, subscriptionId: created.id, product: product.key }, "admin granted subscription")
  return { subscription: toSubscriptionDTO(created), checkout: null, alreadyActive: false }
}

export async function adminListSubscriptions(q: AdminSubscriptionsQuery) {
  const where = {
    ...(q.status && { status: q.status }),
    ...(q.product && { product: q.product as SubscriptionProductKey }),
    ...(q.subscriberType && { subscriberType: q.subscriberType }),
  }
  const [rows, total] = await Promise.all([
    prisma.subscription.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.subscription.count({ where }),
  ])
  return { items: rows.map(toSubscriptionDTO), meta: pageMeta(q, total) }
}
