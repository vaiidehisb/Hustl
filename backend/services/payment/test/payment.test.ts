import "../../deal/test/setup-env"
import type { FastifyInstance } from "fastify"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { TOPICS } from "@hustl/common"
import { prisma } from "@hustl/db"
import { bearer, internal, makeBrand, makeCreator, outbox } from "../../deal/test/helpers"
import { buildApp } from "../src/app"
import { razorpaySignature } from "../src/providers/razorpay"

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp({ logger: false })
})
afterAll(async () => {
  await app?.close()
  await prisma.$disconnect()
})

/** A signed deal inserted directly (payment-service only reads deals). */
async function signedDeal(opts: { status?: "CONTRACT_SIGNED" | "AGREED"; holdUntil?: Date } = {}) {
  const b = await makeBrand()
  const c = await makeCreator()
  const deal = await prisma.deal.create({
    data: {
      title: "Webhook fixture deal",
      brandId: b.brand.id,
      creatorId: c.creator.id,
      status: opts.status ?? "CONTRACT_SIGNED",
      amount: 10_000,
      paymentMode: "COMPLETION",
      brandFeeRate: 0.08,
      creatorFeeRate: 0.05,
      processingFeeRate: 0.02,
      holdUntil: opts.holdUntil ?? null,
      milestones: { create: [{ position: 0, title: "Final delivery", percent: 100, amount: 10_000 }] },
    },
    include: { milestones: true },
  })
  return { b, c, deal }
}

const inject = (method: "GET" | "POST", url: string, opts: { token?: string; payload?: string | object; headers?: Record<string, string> } = {}) =>
  app.inject({ method, url, payload: opts.payload as never, headers: { ...(opts.token && bearer(opts.token)), ...opts.headers } })

describe("payment-service", () => {
  it("rejects webhooks with a bad signature (400)", async () => {
    const body = JSON.stringify({ event: "order.paid", payload: {} })
    const bad = await inject("POST", "/payments/webhooks/razorpay", { payload: body, headers: { "content-type": "application/json", "x-razorpay-signature": razorpaySignature(body, "not-the-secret") } })
    expect(bad.statusCode).toBe(400)
    expect(bad.json().error.code).toBe("BAD_REQUEST")
    const missing = await inject("POST", "/payments/webhooks/razorpay", { payload: body, headers: { "content-type": "application/json" } })
    expect(missing.statusCode).toBe(400)
  })

  it("processes a signed Razorpay webhook once (idempotent on provider event id)", async () => {
    const { deal } = await signedDeal()
    const orderId = `order_${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}`
    await prisma.paymentIntent.create({
      data: { dealId: deal.id, provider: "RAZORPAY", providerIntentId: orderId, clientSecret: orderId, escrowAmount: 10_000, brandFee: 800, processingFee: 200, totalAmount: 11_000, idempotencyKey: `fund:${deal.id}` },
    })
    const paymentId = `pay_${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}`
    // Raw bytes with unusual spacing: verification must use the exact body.
    const body = `{"event":"order.paid",  "payload":{"payment":{"entity":{"id":"${paymentId}","order_id":"${orderId}","amount":1100000,"status":"captured"}},"order":{"entity":{"id":"${orderId}","amount_paid":1100000}}}}`
    const headers = { "content-type": "application/json", "x-razorpay-signature": razorpaySignature(body, process.env.RAZORPAY_WEBHOOK_SECRET!), "x-razorpay-event-id": `evt_${paymentId}` }

    const first = await inject("POST", "/payments/webhooks/razorpay", { payload: body, headers })
    expect(first.statusCode).toBe(200)
    expect(first.json().data).toMatchObject({ duplicate: false, outcome: "funded" })
    const second = await inject("POST", "/payments/webhooks/razorpay", { payload: body, headers })
    expect(second.json().data).toMatchObject({ duplicate: true })

    // A different event for the same payment (payment.captured) is also a no-op.
    const captured = `{"event":"payment.captured","payload":{"payment":{"entity":{"id":"${paymentId}","order_id":"${orderId}","amount":1100000,"status":"captured"}}}}`
    const third = await inject("POST", "/payments/webhooks/razorpay", { payload: captured, headers: { ...headers, "x-razorpay-signature": razorpaySignature(captured, process.env.RAZORPAY_WEBHOOK_SECRET!), "x-razorpay-event-id": `evt2_${paymentId}` } })
    expect(third.json().data).toMatchObject({ duplicate: false, outcome: "already_succeeded" })

    expect(await prisma.ledgerEntry.count({ where: { dealId: deal.id } })).toBe(3)
    expect(await outbox(deal.id, TOPICS.PAYMENT_FUNDED)).toHaveLength(1)
    const escrow = await prisma.escrowAccount.findUniqueOrThrow({ where: { dealId: deal.id } })
    expect(escrow).toMatchObject({ status: "FUNDED", fundedAmount: 10_000, provider: "RAZORPAY" })
    expect((await prisma.ledgerEntry.findFirstOrThrow({ where: { dealId: deal.id, type: "ESCROW_FUND" } })).providerRef).toBe(paymentId)
  })

  it("authorises parties: creators and outsiders can't fund or read", async () => {
    const { b, c, deal } = await signedDeal()
    const outsider = await makeBrand()
    expect((await inject("POST", `/payments/deals/${deal.id}/intent`, { token: c.token })).statusCode).toBe(403)
    expect((await inject("POST", `/payments/deals/${deal.id}/intent`, { token: outsider.token })).statusCode).toBe(403)
    expect((await inject("GET", `/payments/deals/${deal.id}`, { token: outsider.token })).statusCode).toBe(403)
    expect((await inject("POST", `/payments/deals/${deal.id}/intent`)).statusCode).toBe(401)
    const own = await inject("GET", `/payments/deals/${deal.id}`, { token: b.token })
    expect(own.json().data.escrow).toMatchObject({ status: "UNFUNDED", funding: { total: 11_000 } })
    const summary = await inject("GET", "/payments/me/summary", { token: c.token })
    expect(summary.json().data).toMatchObject({ role: "CREATOR", payoutAccountStatus: "NOT_CONNECTED" })
  })

  it("requires CONTRACT_SIGNED and no active hold", async () => {
    const agreed = await signedDeal({ status: "AGREED" })
    expect((await inject("POST", `/payments/deals/${agreed.deal.id}/intent`, { token: agreed.b.token })).statusCode).toBe(409)
    const held = await signedDeal({ holdUntil: new Date(Date.now() + 3_600_000) })
    expect((await inject("POST", `/payments/deals/${held.deal.id}/intent`, { token: held.b.token })).statusCode).toBe(409)
  })

  it("refuses to release milestones that are not approved, and needs the internal token", async () => {
    const { deal } = await signedDeal()
    const mid = deal.milestones[0].id
    expect((await inject("POST", `/internal/payments/milestones/${mid}/release`)).statusCode).toBe(403)
    const res = await inject("POST", `/internal/payments/milestones/${mid}/release`, { headers: internal() })
    expect(res.statusCode).toBe(409)
  })

  it("answers 503 listing missing env when the provider isn't configured", async () => {
    const { b, deal } = await signedDeal()
    const prev = process.env.PAYMENTS_PROVIDER
    process.env.PAYMENTS_PROVIDER = "stripe"
    delete process.env.STRIPE_SECRET_KEY
    try {
      const res = await inject("POST", `/payments/deals/${deal.id}/intent`, { token: b.token })
      expect(res.statusCode).toBe(503)
      expect(res.json().error).toMatchObject({ code: "INTEGRATION_UNAVAILABLE", details: { missingEnv: ["STRIPE_SECRET_KEY"] } })
      const hook = await inject("POST", "/payments/webhooks/stripe", { payload: "{}", headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=abc" } })
      expect(hook.statusCode).toBe(503)
    } finally {
      process.env.PAYMENTS_PROVIDER = prev
    }
  })

  it("creates a sandbox payout account link for creators", async () => {
    const c = await makeCreator()
    const res = await inject("POST", "/payments/payout-account/onboarding-link", { token: c.token, payload: {}, headers: { "content-type": "application/json" } })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.account).toMatchObject({ status: "ACTIVE", provider: "TEST" })
    expect(res.json().data.account.providerAccountId).toMatch(/^test_/)
  })
})
