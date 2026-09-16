import "../../deal/test/setup-env"
import type { AddressInfo } from "node:net"
import type { FastifyInstance } from "fastify"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { TOPICS, type EventEnvelope } from "@hustl/common"
import { BRAND_FEE_RATES, PLAN_CATALOG, planProduct } from "@hustl/contracts"
import { prisma } from "@hustl/db"
import { buildApp as buildDealApp } from "../../deal/src/app"
import { bearer, makeAdmin, makeBrand, makeCreator, outbox } from "../../deal/test/helpers"
import { handleSubscriptionEvent } from "../../user/src/services/entitlements"
import { buildApp } from "../src/app"
import { razorpaySignature } from "../src/providers/razorpay"
import { expireSubscriptions } from "../src/services/billing"

let app: FastifyInstance
let deal: FastifyInstance

beforeAll(async () => {
  app = await buildApp({ logger: false })
  await app.listen({ port: 0, host: "127.0.0.1" })
  process.env.PAYMENT_SERVICE_URL = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  deal = await buildDealApp({ logger: false })
})

afterAll(async () => {
  await deal?.close()
  await app?.close()
  await prisma.$disconnect()
})

type Res<T> = { status: number; body: { success: boolean; data: T; meta?: Record<string, unknown>; error?: { code: string; message: string; details?: unknown } } }

async function call<T = unknown>(target: FastifyInstance, method: "GET" | "POST", url: string, token?: string | null, payload?: unknown): Promise<Res<T>> {
  const res = await target.inject({ method, url, payload: payload as never, headers: { ...(token && bearer(token)) } })
  return { status: res.statusCode, body: res.json() }
}

type SubDTO = { id: string; status: string; product: string; currentPeriodEnd: string; cancelAtPeriodEnd: boolean; entitled: boolean; priceAmount: number; provider: string }

/** Runs the events payment-service published for a subscription through user-service's entitlement consumer. */
async function applyEntitlements(subscriptionId: string, topics = [TOPICS.SUBSCRIPTION_ACTIVATED, TOPICS.SUBSCRIPTION_RENEWED, TOPICS.SUBSCRIPTION_EXPIRED, TOPICS.SUBSCRIPTION_CANCELLED]) {
  const events: EventEnvelope[] = []
  for (const topic of topics) events.push(...(await outbox(subscriptionId, topic)))
  events.sort((a, b) => Number(a.id) - Number(b.id))
  const outcomes: string[] = []
  for (const e of events) outcomes.push(await handleSubscriptionEvent(e))
  return outcomes
}

/** Self-serve purchase through the real endpoints: subscribe → confirm-test. */
async function buy(token: string, product: string) {
  const created = await call<{ subscription: SubDTO; checkout: { provider: string; confirmPath: string } }>(app, "POST", "/payments/billing/subscribe", token, { product })
  expect(created.status).toBe(200)
  const sub = created.body.data.subscription
  const confirmed = await call<{ subscription: SubDTO; invoice: { id: string; amount: number; status: string } | null }>(
    app,
    "POST",
    `/payments/billing/subscriptions/${sub.id}/confirm-test`,
    token,
  )
  expect(confirmed.status).toBe(200)
  return { created: created.body.data, confirmed: confirmed.body.data, id: sub.id }
}

const offerBody = (creatorId: string, amount = 20_000) => ({
  creatorId,
  title: "Billing fee snapshot campaign",
  amount,
  paymentMode: "COMPLETION",
  deliverables: "1 reel",
  milestones: [{ title: "Content live", percent: 100 }],
})

describe("plan catalog", () => {
  it("is the single source of truth for brand fee rates", () => {
    expect(BRAND_FEE_RATES.STARTER).toBe(0.08)
    expect(BRAND_FEE_RATES.GROWTH).toBe(planProduct("BRAND_GROWTH")!.brandFeeRate)
    expect(BRAND_FEE_RATES.GROWTH).toBe(0.05)
    expect(BRAND_FEE_RATES.ENTERPRISE).toBe(planProduct("BRAND_ENTERPRISE")!.brandFeeRate)
  })

  it("prices the products from the architecture doc", () => {
    expect(PLAN_CATALOG.map((p) => [p.key, p.price, p.interval])).toEqual([
      ["BRAND_GROWTH", 2999, "MONTH"],
      ["BRAND_ENTERPRISE", null, "MONTH"],
      ["CREATOR_BADGE_STANDARD", 999, "YEAR"],
      ["CREATOR_BADGE_PRIORITY", 1999, "YEAR"],
    ])
    // The paid badge is placement, never identity verification.
    expect(PLAN_CATALOG.filter((p) => p.badgeTier).every((p) => p.audience === "CREATOR")).toBe(true)
  })
})

describe("subscribe → confirm-test → ACTIVE", () => {
  it("activates the Growth plan with a paid invoice and an activation event", async () => {
    const b = await makeBrand()
    const { created, confirmed, id } = await buy(b.token, "BRAND_GROWTH")

    expect(created.subscription).toMatchObject({ status: "PENDING", product: "BRAND_GROWTH", priceAmount: 2999, provider: "TEST" })
    expect(created.checkout).toMatchObject({ provider: "TEST", confirmPath: `/payments/billing/subscriptions/${id}/confirm-test` })
    expect(confirmed.subscription).toMatchObject({ status: "ACTIVE", entitled: true })
    expect(confirmed.invoice).toMatchObject({ amount: 2999, status: "PAID" })

    const row = await prisma.subscription.findUniqueOrThrow({ where: { id } })
    // A monthly plan runs for one month.
    expect(Math.round((row.currentPeriodEnd.getTime() - row.currentPeriodStart.getTime()) / 86_400_000)).toBeGreaterThanOrEqual(28)
    expect(await outbox(id, TOPICS.SUBSCRIPTION_ACTIVATED)).toHaveLength(1)
    const [event] = await outbox(id, TOPICS.SUBSCRIPTION_ACTIVATED)
    // notification-service builds its copy from the payload alone.
    expect(event.payload).toMatchObject({ productName: "Growth", amount: 2999, brandPlan: "GROWTH", userId: b.user.id, subscriberType: "BRAND" })
    expect(event.payload.currentPeriodEnd).toBeTypeOf("string")

    // Reading it back through the API.
    const mine = await call<{ subscriptions: SubDTO[]; invoices: unknown[]; entitlements: { brandPlan: string; brandFeeRate: number } }>(app, "GET", "/payments/billing/subscription", b.token)
    expect(mine.body.data.subscriptions[0]).toMatchObject({ id, status: "ACTIVE" })
    expect(mine.body.data.invoices).toHaveLength(1)
    expect(mine.body.data.entitlements).toMatchObject({ brandPlan: "GROWTH", brandFeeRate: 0.05 })

    const products = await call<{ products: { key: string; owned: boolean }[]; audience: string }>(app, "GET", "/payments/billing/products", b.token)
    expect(products.body.data.audience).toBe("BRAND")
    expect(products.body.data.products.map((p) => p.key)).toEqual(["BRAND_GROWTH", "BRAND_ENTERPRISE"])
    expect(products.body.data.products.find((p) => p.key === "BRAND_GROWTH")?.owned).toBe(true)
  })

  it("re-subscribing while active is a 409, and the caller keeps the one they have", async () => {
    const b = await makeBrand()
    const { id } = await buy(b.token, "BRAND_GROWTH")
    const again = await call(app, "POST", "/payments/billing/subscribe", b.token, { product: "BRAND_GROWTH" })
    expect(again.status).toBe(409)
    expect(again.body.error).toMatchObject({ code: "CONFLICT" })
    expect((again.body.error?.details as { subscriptionId: string }).subscriptionId).toBe(id)
    expect(await prisma.subscription.count({ where: { id: { not: id }, brandId: (await prisma.brandProfile.findUniqueOrThrow({ where: { userId: b.user.id } })).id } })).toBe(0)
  })

  it("re-opening an unfinished checkout reuses the same subscription", async () => {
    const b = await makeBrand()
    const first = await call<{ subscription: SubDTO }>(app, "POST", "/payments/billing/subscribe", b.token, { product: "BRAND_GROWTH" })
    const second = await call<{ subscription: SubDTO }>(app, "POST", "/payments/billing/subscribe", b.token, { product: "BRAND_GROWTH" })
    expect(second.status).toBe(200)
    expect(second.body.data.subscription.id).toBe(first.body.data.subscription.id)
  })
})

describe("entitlements", () => {
  it("drops the brand fee to 5% on the next offer while an existing deal keeps 8%", async () => {
    const b = await makeBrand()
    const c = await makeCreator()

    const before = await call<{ id: string }>(deal, "POST", "/deals", b.token, offerBody(c.creator.id))
    expect(before.status).toBe(201)
    const beforeDeal = await prisma.deal.findUniqueOrThrow({ where: { id: before.body.data.id } })
    expect(beforeDeal.brandFeeRate).toBe(0.08)

    const { id } = await buy(b.token, "BRAND_GROWTH")
    expect(await applyEntitlements(id)).toEqual(["brand_plan_growth"])
    expect((await prisma.brandProfile.findUniqueOrThrow({ where: { userId: b.user.id } })).plan).toBe("GROWTH")

    const after = await call<{ id: string }>(deal, "POST", "/deals", b.token, offerBody(c.creator.id))
    const afterDeal = await prisma.deal.findUniqueOrThrow({ where: { id: after.body.data.id } })
    expect(afterDeal.brandFeeRate).toBe(0.05)

    // The fee is snapshotted at offer time: the older deal is untouched.
    expect((await prisma.deal.findUniqueOrThrow({ where: { id: beforeDeal.id } })).brandFeeRate).toBe(0.08)
    const escrow = await call<{ escrow: { funding: { brandFee: number; total: number } } }>(app, "GET", `/payments/deals/${beforeDeal.id}`, b.token)
    expect(escrow.body.data.escrow.funding).toMatchObject({ brandFee: 1600, total: 22_000 })
  })

  it("applying the same activation twice is a no-op", async () => {
    const b = await makeBrand()
    const { id } = await buy(b.token, "BRAND_GROWTH")
    expect(await applyEntitlements(id)).toEqual(["brand_plan_growth"])
    expect(await applyEntitlements(id)).toEqual(["unchanged"])
  })

  it("gives a creator the paid badge without touching KYC verification", async () => {
    const c = await makeCreator()
    const { id } = await buy(c.token, "CREATOR_BADGE_PRIORITY")
    expect(await applyEntitlements(id)).toEqual(["creator_badge_priority"])
    const creator = await prisma.creatorProfile.findUniqueOrThrow({ where: { userId: c.user.id } })
    expect(creator.badgeTier).toBe("PRIORITY")
    expect(creator.badgeUntil!.getTime()).toBeGreaterThan(Date.now() + 300 * 86_400_000)
    // The paid badge is not identity verification.
    expect(creator.verifiedAt).toBeNull()
  })
})

describe("access control", () => {
  it("a creator can't buy a brand plan, and a brand can't buy the creator badge", async () => {
    const c = await makeCreator()
    const b = await makeBrand()
    const creatorBuysBrandPlan = await call(app, "POST", "/payments/billing/subscribe", c.token, { product: "BRAND_GROWTH" })
    expect(creatorBuysBrandPlan.status).toBe(403)
    const brandBuysBadge = await call(app, "POST", "/payments/billing/subscribe", b.token, { product: "CREATOR_BADGE_STANDARD" })
    expect(brandBuysBadge.status).toBe(403)
    expect((await call(app, "POST", "/payments/billing/subscribe", null, { product: "BRAND_GROWTH" })).status).toBe(401)
    // Enterprise is not self-serve, so it isn't even in the request schema.
    expect((await call(app, "POST", "/payments/billing/subscribe", b.token, { product: "BRAND_ENTERPRISE" })).status).toBe(422)
  })

  it("another account can't cancel or confirm your subscription", async () => {
    const b = await makeBrand()
    const other = await makeBrand()
    const { id } = await buy(b.token, "BRAND_GROWTH")
    expect((await call(app, "POST", `/payments/billing/subscriptions/${id}/cancel`, other.token)).status).toBe(403)
    expect((await call(app, "POST", `/payments/billing/subscriptions/${id}/confirm-test`, other.token)).status).toBe(403)
  })

  it("answers 503 listing the missing env when the provider isn't configured", async () => {
    const b = await makeBrand()
    const prev = { provider: process.env.PAYMENTS_PROVIDER, secret: process.env.STRIPE_SECRET_KEY }
    process.env.PAYMENTS_PROVIDER = "stripe"
    delete process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_PRICE_BRAND_GROWTH
    try {
      const res = await call(app, "POST", "/payments/billing/subscribe", b.token, { product: "BRAND_GROWTH" })
      expect(res.status).toBe(503)
      expect(res.body.error?.code).toBe("INTEGRATION_UNAVAILABLE")
      expect((res.body.error?.details as { missingEnv: string[] }).missingEnv).toEqual(["STRIPE_SECRET_KEY", "STRIPE_PRICE_BRAND_GROWTH"])
      // Nothing was written: no fake success.
      expect(await prisma.subscription.count({ where: { brand: { userId: b.user.id } } })).toBe(0)
    } finally {
      process.env.PAYMENTS_PROVIDER = prev.provider
      if (prev.secret) process.env.STRIPE_SECRET_KEY = prev.secret
    }
  })
})

describe("cancel and expiry", () => {
  it("cancels at period end, keeps access, then the sweep expires it and clears the badge", async () => {
    const c = await makeCreator()
    const { id } = await buy(c.token, "CREATOR_BADGE_STANDARD")
    await applyEntitlements(id)
    expect((await prisma.creatorProfile.findUniqueOrThrow({ where: { userId: c.user.id } })).badgeTier).toBe("STANDARD")

    const cancelled = await call<{ subscription: SubDTO; accessUntil: string }>(app, "POST", `/payments/billing/subscriptions/${id}/cancel`, c.token)
    expect(cancelled.status).toBe(200)
    expect(cancelled.body.data.subscription).toMatchObject({ status: "ACTIVE", cancelAtPeriodEnd: true, entitled: true })
    expect(cancelled.body.data.accessUntil).toBe(cancelled.body.data.subscription.currentPeriodEnd)
    expect(await outbox(id, TOPICS.SUBSCRIPTION_CANCELLED)).toHaveLength(1)

    // Access survives the cancellation until the period runs out (re-applying the
    // activation is a no-op, and the cancellation changes nothing yet).
    expect(await applyEntitlements(id)).toEqual(["unchanged", "no_change"])
    expect((await prisma.creatorProfile.findUniqueOrThrow({ where: { userId: c.user.id } })).badgeTier).toBe("STANDARD")

    // Fast-forward past the paid period and run the sweep.
    await prisma.subscription.update({ where: { id }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } })
    const swept = await expireSubscriptions()
    expect(swept.ids).toContain(id)
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id } })).status).toBe("EXPIRED")
    const [expiredEvent] = await outbox(id, TOPICS.SUBSCRIPTION_EXPIRED)
    expect(expiredEvent.payload).toMatchObject({ reason: "CANCELLED_AT_PERIOD_END", creatorId: (await prisma.creatorProfile.findUniqueOrThrow({ where: { userId: c.user.id } })).id })

    expect(await applyEntitlements(id)).toEqual(["unchanged", "no_change", "creator_badge_cleared"])
    const creator = await prisma.creatorProfile.findUniqueOrThrow({ where: { userId: c.user.id } })
    expect(creator.badgeTier).toBeNull()
    expect(creator.badgeUntil).toBeNull()

    // The sweep is idempotent.
    expect((await expireSubscriptions()).ids).not.toContain(id)
  })

  it("expiring a brand plan drops the brand back to STARTER fees", async () => {
    const b = await makeBrand()
    const { id } = await buy(b.token, "BRAND_GROWTH")
    await applyEntitlements(id)
    await prisma.subscription.update({ where: { id }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } })
    await expireSubscriptions()
    await applyEntitlements(id)
    expect((await prisma.brandProfile.findUniqueOrThrow({ where: { userId: b.user.id } })).plan).toBe("STARTER")

    const c = await makeCreator()
    const after = await call<{ id: string }>(deal, "POST", "/deals", b.token, offerBody(c.creator.id))
    expect((await prisma.deal.findUniqueOrThrow({ where: { id: after.body.data.id } })).brandFeeRate).toBe(0.08)
  })

  it("cancelling a subscription that never activated closes it immediately", async () => {
    const b = await makeBrand()
    const created = await call<{ subscription: SubDTO }>(app, "POST", "/payments/billing/subscribe", b.token, { product: "BRAND_GROWTH" })
    const id = created.body.data.subscription.id
    const cancelled = await call<{ subscription: SubDTO }>(app, "POST", `/payments/billing/subscriptions/${id}/cancel`, b.token)
    expect(cancelled.body.data.subscription).toMatchObject({ status: "CANCELLED", entitled: false })
    expect((await call(app, "POST", `/payments/billing/subscriptions/${id}/cancel`, b.token)).status).toBe(409)
  })
})

describe("provider webhooks", () => {
  /** A Razorpay-provider subscription, inserted the way a real checkout would have left it. */
  async function razorpaySubscription() {
    const b = await makeBrand()
    const brand = await prisma.brandProfile.findUniqueOrThrow({ where: { userId: b.user.id } })
    const providerSubscriptionId = `sub_${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}`
    const now = new Date()
    const sub = await prisma.subscription.create({
      data: {
        subscriberType: "BRAND",
        brandId: brand.id,
        product: "BRAND_GROWTH",
        status: "PENDING",
        provider: "RAZORPAY",
        providerSubscriptionId,
        priceAmount: 2999,
        interval: "MONTH",
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000),
      },
    })
    return { b, brand, sub, providerSubscriptionId }
  }

  const post = (body: string, eventId: string) =>
    app.inject({
      method: "POST",
      url: "/payments/webhooks/razorpay",
      payload: body,
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": razorpaySignature(body, process.env.RAZORPAY_WEBHOOK_SECRET!),
        "x-razorpay-event-id": eventId,
      },
    })

  const chargedBody = (subId: string, invoiceId: string, start: number, end: number) =>
    JSON.stringify({
      event: "subscription.charged",
      payload: {
        subscription: { entity: { id: subId, status: "active", current_start: start, current_end: end } },
        invoice: { entity: { id: invoiceId, amount: 299_900, amount_paid: 299_900 } },
        payment: { entity: { id: `pay_${invoiceId}`, order_id: null, amount: 299_900, status: "captured" } },
      },
    })

  it("activates on subscription.charged, renews on the next one, and is idempotent", async () => {
    const { sub, providerSubscriptionId } = await razorpaySubscription()
    const start = Math.floor(Date.now() / 1000)
    const end = start + 30 * 86_400
    const body = chargedBody(providerSubscriptionId, `inv_${sub.id.slice(0, 8)}`, start, end)

    const first = await post(body, `evt_sub_${sub.id}`)
    expect(first.statusCode).toBe(200)
    expect(first.json().data).toMatchObject({ duplicate: false, outcome: "activated" })

    const replay = await post(body, `evt_sub_${sub.id}`)
    expect(replay.json().data).toMatchObject({ duplicate: true })

    // Renewal for the following period.
    const renewal = await post(chargedBody(providerSubscriptionId, `inv2_${sub.id.slice(0, 8)}`, end, end + 30 * 86_400), `evt_sub2_${sub.id}`)
    expect(renewal.json().data).toMatchObject({ duplicate: false, outcome: "renewed" })

    const row = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })
    expect(row.status).toBe("ACTIVE")
    expect(row.currentPeriodEnd.getTime()).toBe((end + 30 * 86_400) * 1000)
    expect(await prisma.subscriptionInvoice.count({ where: { subscriptionId: sub.id } })).toBe(2)
    expect(await outbox(sub.id, TOPICS.SUBSCRIPTION_ACTIVATED)).toHaveLength(1)
    expect(await outbox(sub.id, TOPICS.SUBSCRIPTION_RENEWED)).toHaveLength(1)
  })

  it("marks a failed charge PAST_DUE (access continues until the period ends) and records the invoice", async () => {
    const { sub, providerSubscriptionId } = await razorpaySubscription()
    const start = Math.floor(Date.now() / 1000)
    await post(chargedBody(providerSubscriptionId, `inv_ok_${sub.id.slice(0, 8)}`, start, start + 30 * 86_400), `evt_ok_${sub.id}`)

    const failed = JSON.stringify({
      event: "subscription.halted",
      payload: {
        subscription: { entity: { id: providerSubscriptionId, status: "halted", current_start: start, current_end: start + 30 * 86_400 } },
        payment: { entity: { id: `pay_fail_${sub.id.slice(0, 8)}`, order_id: null, amount: 299_900, status: "failed", error_description: "card declined" } },
      },
    })
    const res = await post(failed, `evt_fail_${sub.id}`)
    expect(res.json().data).toMatchObject({ outcome: "payment_failed" })
    const row = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })
    expect(row.status).toBe("PAST_DUE")
    const invoice = await prisma.subscriptionInvoice.findFirstOrThrow({ where: { subscriptionId: sub.id, status: "FAILED" } })
    expect(invoice.failureReason).toBe("card declined")
    const [event] = await outbox(sub.id, TOPICS.SUBSCRIPTION_PAYMENT_FAILED)
    expect(event.payload).toMatchObject({ reason: "card declined", productName: "Growth" })
  })

  it("a provider cancellation keeps access to the end of the paid period", async () => {
    const { sub, providerSubscriptionId } = await razorpaySubscription()
    const start = Math.floor(Date.now() / 1000)
    await post(chargedBody(providerSubscriptionId, `inv_c_${sub.id.slice(0, 8)}`, start, start + 30 * 86_400), `evt_c_${sub.id}`)
    const res = await post(
      JSON.stringify({ event: "subscription.cancelled", payload: { subscription: { entity: { id: providerSubscriptionId, status: "cancelled", ended_at: start } } } }),
      `evt_cancel_${sub.id}`,
    )
    expect(res.json().data).toMatchObject({ outcome: "cancelled" })
    const row = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })
    expect(row.status).toBe("ACTIVE")
    expect(row.cancelAtPeriodEnd).toBe(true)
    expect(row.cancelledAt).not.toBeNull()
  })

  it("ignores events for subscriptions we don't know", async () => {
    const unique = crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    const res = await post(chargedBody(`sub_not_ours_${unique}`, `inv_not_ours_${unique}`, 1, 2), `evt_unknown_sub_${unique}`)
    expect(res.json().data).toMatchObject({ outcome: "unknown_subscription" })
  })
})

describe("admin billing", () => {
  it("grants Enterprise to a brand and lists it", async () => {
    const admin = await makeAdmin()
    const b = await makeBrand()
    const brand = await prisma.brandProfile.findUniqueOrThrow({ where: { userId: b.user.id } })

    const granted = await call<{ subscription: SubDTO }>(app, "POST", "/admin/billing/subscriptions", admin.token, {
      subscriberType: "BRAND",
      brandId: brand.id,
      product: "BRAND_ENTERPRISE",
      priceAmount: 0,
      periodDays: 365,
      note: "Signed annual contract",
    })
    expect(granted.status).toBe(201)
    expect(granted.body.data.subscription).toMatchObject({ status: "ACTIVE", provider: "MANUAL", product: "BRAND_ENTERPRISE", entitled: true })

    expect(await applyEntitlements(granted.body.data.subscription.id)).toEqual(["brand_plan_enterprise"])
    expect((await prisma.brandProfile.findUniqueOrThrow({ where: { id: brand.id } })).plan).toBe("ENTERPRISE")

    const c = await makeCreator()
    const offer = await call<{ id: string }>(deal, "POST", "/deals", b.token, offerBody(c.creator.id))
    expect((await prisma.deal.findUniqueOrThrow({ where: { id: offer.body.data.id } })).brandFeeRate).toBe(0.05)

    const list = await call<SubDTO[]>(app, "GET", "/admin/billing/subscriptions?product=BRAND_ENTERPRISE&status=ACTIVE", admin.token)
    expect(list.status).toBe(200)
    expect(list.body.data.some((s) => s.id === granted.body.data.subscription.id)).toBe(true)
  })

  it("is admin-only and validates the subscriber", async () => {
    const b = await makeBrand()
    const admin = await makeAdmin()
    const brand = await prisma.brandProfile.findUniqueOrThrow({ where: { userId: b.user.id } })
    expect((await call(app, "POST", "/admin/billing/subscriptions", b.token, { subscriberType: "BRAND", brandId: brand.id, product: "BRAND_GROWTH" })).status).toBe(403)
    expect((await call(app, "GET", "/admin/billing/subscriptions", b.token)).status).toBe(403)
    // A creator product needs a creatorId.
    expect((await call(app, "POST", "/admin/billing/subscriptions", admin.token, { subscriberType: "BRAND", brandId: brand.id, product: "CREATOR_BADGE_STANDARD" })).status).toBe(400)
  })

  it("supersedes a self-serve plan when an admin grants a better one", async () => {
    const admin = await makeAdmin()
    const b = await makeBrand()
    const brand = await prisma.brandProfile.findUniqueOrThrow({ where: { userId: b.user.id } })
    const { id: growthId } = await buy(b.token, "BRAND_GROWTH")
    await applyEntitlements(growthId)

    const granted = await call<{ subscription: SubDTO }>(app, "POST", "/admin/billing/subscriptions", admin.token, {
      subscriberType: "BRAND",
      brandId: brand.id,
      product: "BRAND_GROWTH",
      priceAmount: 0,
      note: "Comped for a support issue",
    })
    expect(granted.status).toBe(201)
    // The old one is closed, so the partial unique index still holds.
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: growthId } })).status).toBe("EXPIRED")
    expect(await prisma.subscription.count({ where: { brandId: brand.id, product: "BRAND_GROWTH", status: "ACTIVE" } })).toBe(1)
  })
})
