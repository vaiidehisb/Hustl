import "./setup-env"
import type { AddressInfo } from "node:net"
import type { FastifyInstance } from "fastify"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { TOPICS } from "@hustl/common"
import type { DealDetail } from "@hustl/contracts"
import { prisma } from "@hustl/db"
import { buildApp as buildPaymentApp } from "../../payment/src/app"
import { buildApp, handleEvent } from "../src/app"
import { bearer, deadUrl, internal, makeAdmin, makeBrand, makeCreator, outbox, startAiStub } from "./helpers"

let deal: FastifyInstance
let payment: FastifyInstance
let paymentUrl: string

beforeAll(async () => {
  payment = await buildPaymentApp({ logger: false })
  await payment.listen({ port: 0, host: "127.0.0.1" })
  paymentUrl = `http://127.0.0.1:${(payment.server.address() as AddressInfo).port}`
  process.env.PAYMENT_SERVICE_URL = paymentUrl
  deal = await buildApp({ logger: false })
})

afterAll(async () => {
  await deal?.close()
  await payment?.close()
  await prisma.$disconnect()
})

type Res<T> = { status: number; body: { success: boolean; data: T; meta?: Record<string, unknown>; error?: { code: string; details?: unknown } } }
async function call<T = DealDetail>(app: FastifyInstance, method: "GET" | "POST" | "PATCH" | "DELETE", url: string, token?: string | null, payload?: unknown, headers: Record<string, string> = {}): Promise<Res<T>> {
  const res = await app.inject({ method, url, payload: payload as never, headers: { ...(token && bearer(token)), ...headers } })
  return { status: res.statusCode, body: res.json() }
}

async function consume(dealId: string, topic: (typeof TOPICS)[keyof typeof TOPICS]) {
  for (const e of await outbox(dealId, topic)) await handleEvent(e)
}

const offerBody = (creatorId: string, amount = 20_000) => ({
  creatorId,
  title: "Festive launch campaign",
  amount,
  paymentMode: "MILESTONES",
  deliverables: "1 reel + 3 stories",
  milestones: [
    { title: "Script approval", percent: 40, dueDate: new Date(Date.now() + 5 * 86_400_000).toISOString() },
    { title: "Content live", percent: 60, dueDate: new Date(Date.now() + 10 * 86_400_000).toISOString() },
  ],
})

/** Offer → accept → sign ×2 → intent → confirm-test → funded consumer. */
async function fundedDeal() {
  const b = await makeBrand()
  const c = await makeCreator()
  const created = await call(deal, "POST", "/deals", b.token, offerBody(c.creator.id))
  const id = created.body.data.id
  await call(deal, "POST", `/deals/${id}/accept`, c.token)
  await call(deal, "POST", `/deals/${id}/contract/sign`, b.token, { signerName: b.user.name })
  await call(deal, "POST", `/deals/${id}/contract/sign`, c.token, { signerName: c.user.name })
  const intent = await call<{ intent: { id: string } }>(payment, "POST", `/payments/deals/${id}/intent`, b.token)
  await call(payment, "POST", `/payments/intents/${intent.body.data.intent.id}/confirm-test`, b.token)
  await consume(id, TOPICS.PAYMENT_FUNDED)
  const detail = await call(deal, "GET", `/deals/${id}`, b.token)
  expect(detail.body.data.status).toBe("IN_PROGRESS")
  return { b, c, id, detail: detail.body.data }
}

describe("deal lifecycle (deal-service + payment-service)", () => {
  it("offer → counter ×2 → 3rd counter 409 → accept → sign ×2 → fund → IN_PROGRESS → submit → approve → release → COMPLETED", async () => {
    const b = await makeBrand({ name: "Asha Rao" })
    const c = await makeCreator({ name: "Ravi Kumar" })
    const outsider = await makeCreator()

    // Offer
    const created = await call(deal, "POST", "/deals", b.token, offerBody(c.creator.id))
    expect(created.status).toBe(201)
    const id = created.body.data.id
    expect(created.body.data.status).toBe("OFFER_SENT")
    expect(created.body.data.milestones.map((m) => m.amount)).toEqual([8000, 12_000])
    expect(created.body.data.feeRates).toEqual({ brand: 0.08, processing: 0.02 })
    expect(created.body.data.allowedActions).toEqual(["CANCEL"])
    expect(created.body.data.holdUntil).toBeNull()
    expect(await outbox(id, TOPICS.OFFER_SENT)).toHaveLength(1)

    // Unauthorised party
    expect((await call(deal, "GET", `/deals/${id}`, outsider.token)).status).toBe(403)
    expect((await call(deal, "POST", `/deals/${id}/accept`, outsider.token)).status).toBe(403)
    // Not the brand's turn
    expect((await call(deal, "POST", `/deals/${id}/accept`, b.token)).status).toBe(409)

    const creatorView = await call(deal, "GET", `/deals/${id}`, c.token)
    expect(creatorView.body.data.allowedActions).toEqual(["ACCEPT", "DECLINE", "COUNTER", "CANCEL"])
    expect(creatorView.body.data.feeRates).toEqual({ creator: 0.05 })

    // Bad milestone percentages → 422
    expect((await call(deal, "POST", `/deals/${id}/counter`, c.token, { amount: 22_000, milestones: [{ title: "a", percent: 50 }, { title: "b", percent: 40 }] })).status).toBe(422)

    // Counter 1 (creator) and counter 2 (brand)
    const c1 = await call(deal, "POST", `/deals/${id}/counter`, c.token, { amount: 24_000, note: "Rates went up" })
    expect(c1.status).toBe(200)
    expect(c1.body.data.status).toBe("NEGOTIATING")
    expect(c1.body.data.awaitingParty).toBe("BRAND")
    expect(c1.body.data.milestones.map((m) => m.amount)).toEqual([9600, 14_400])
    const c2 = await call(deal, "PATCH", `/deals/${id}/status`, b.token, { action: "COUNTER", offer: { amount: 22_001 } })
    expect(c2.status).toBe(200)
    expect(c2.body.data.offers.map((o) => [o.round, o.status])).toEqual([
      [0, "COUNTERED"],
      [1, "COUNTERED"],
      [2, "PENDING"],
    ])
    expect(c2.body.data.milestones.map((m) => m.amount)).toEqual([8800, 13_201])
    expect(c2.body.data.counterRoundsRemaining).toBe(0)

    // 3rd counter → 409
    const c3 = await call(deal, "POST", `/deals/${id}/counter`, c.token, { amount: 23_000 })
    expect(c3.status).toBe(409)
    expect(c3.body.error?.details).toMatchObject({ action: "COUNTER", from: "NEGOTIATING" })

    // Accept → AGREED with contract
    const accepted = await call(deal, "POST", `/deals/${id}/accept`, c.token)
    expect(accepted.body.data.status).toBe("AGREED")
    const contract = accepted.body.data.contract!
    expect(contract.bodyHash).toMatch(/^[a-f0-9]{64}$/)
    expect(contract.terms.compensation.amount).toBe(22_001)
    expect(contract.terms.clauses).toHaveLength(8)

    // Intent before signatures → 409
    expect((await call(payment, "POST", `/payments/deals/${id}/intent`, b.token)).status).toBe(409)

    // Signing
    expect((await call(deal, "POST", `/deals/${id}/contract/sign`, b.token, { signerName: "Someone Else" })).status).toBe(422)
    expect((await call(deal, "POST", `/deals/${id}/contract/sign`, b.token, { signerName: "asha rao", bodyHash: "0".repeat(64) })).status).toBe(409)
    const s1 = await call(deal, "POST", `/deals/${id}/contract/sign`, b.token, { signerName: "asha rao", bodyHash: contract.bodyHash })
    expect(s1.body.data.status).toBe("AGREED")
    expect(s1.body.data.contract!.signatures.brand.ip).toBeTruthy()
    expect((await call(deal, "POST", `/deals/${id}/contract/sign`, b.token, { signerName: "Asha Rao" })).status).toBe(409)
    const creatorContract = await call<DealDetail["contract"]>(deal, "GET", `/deals/${id}/contract`, c.token)
    expect(creatorContract.body.data!.signatures.brand).not.toHaveProperty("ip")
    const s2 = await call(deal, "POST", `/deals/${id}/contract/sign`, c.token, { signerName: "Ravi Kumar" })
    expect(s2.body.data.status).toBe("CONTRACT_SIGNED")
    expect(await outbox(id, TOPICS.CONTRACT_SIGNED)).toHaveLength(1)
    expect(s2.body.data.allowedActions).toEqual(["CANCEL"])

    // Funding: creator can't, brand can (idempotent)
    expect((await call(payment, "POST", `/payments/deals/${id}/intent`, c.token)).status).toBe(403)
    const i1 = await call<{ intent: { id: string; totalAmount: number; brandFee: number; processingFee: number }; checkout: { provider: string } }>(payment, "POST", `/payments/deals/${id}/intent`, b.token)
    expect(i1.status).toBe(200)
    expect(i1.body.data.intent).toMatchObject({ totalAmount: 22_001 + 1760 + 440, brandFee: 1760, processingFee: 440 })
    expect(i1.body.data.checkout.provider).toBe("TEST")
    const i2 = await call<{ intent: { id: string } }>(payment, "POST", `/payments/deals/${id}/intent`, b.token)
    expect(i2.body.data.intent.id).toBe(i1.body.data.intent.id)

    const confirm = await call<{ duplicate: boolean; escrow: { status: string; fundedAmount: number } }>(payment, "POST", `/payments/intents/${i1.body.data.intent.id}/confirm-test`, b.token)
    expect(confirm.body.data).toMatchObject({ duplicate: false, escrow: { status: "FUNDED", fundedAmount: 22_001 } })
    const again = await call<{ duplicate: boolean }>(payment, "POST", `/payments/intents/${i1.body.data.intent.id}/confirm-test`, b.token)
    expect(again.body.data.duplicate).toBe(true)
    expect(await prisma.ledgerEntry.count({ where: { dealId: id } })).toBe(3)

    // Deal consumer: payment.funded → FUNDED → IN_PROGRESS (idempotent)
    const funded = await outbox(id, TOPICS.PAYMENT_FUNDED)
    expect(funded).toHaveLength(1)
    await handleEvent(funded[0])
    await handleEvent(funded[0])
    const inProgress = await call(deal, "GET", `/deals/${id}`, c.token)
    expect(inProgress.body.data.status).toBe("IN_PROGRESS")
    expect(inProgress.body.data.events.filter((e) => e.type === "FUND" || e.type === "START").map((e) => e.toStatus)).toEqual(["FUNDED", "IN_PROGRESS"])
    const [m1, m2] = inProgress.body.data.milestones
    expect(m1.allowedActions).toEqual(["SUBMIT"])
    expect(m2.allowedActions).toEqual([])

    // Milestones: sequential, revision loop, approve → release
    expect((await call(deal, "POST", `/deals/${id}/milestones/${m2.id}/submit`, c.token, { url: "https://example.com/m2", note: "early" })).status).toBe(409)
    expect((await call(deal, "POST", `/deals/${id}/milestones/${m1.id}/submit`, b.token, { url: "https://example.com/m1", note: "x" })).status).toBe(403)
    expect((await call(deal, "POST", `/deals/${id}/milestones/${m1.id}/submit`, c.token, { url: "https://example.com/script-v1", note: "Script v1" })).status).toBe(200)
    const rev = await call(deal, "POST", `/deals/${id}/milestones/${m1.id}/request-revision`, b.token, { note: "Tighten the hook" })
    expect(rev.body.data.milestones[0]).toMatchObject({ status: "REVISION_REQUESTED", revisionCount: 1, revisionNote: "Tighten the hook" })
    const resub = await call(deal, "POST", `/deals/${id}/milestones/${m1.id}/submit`, c.token, { url: "https://example.com/script-v2", note: "Script v2" })
    expect(resub.body.data.milestones[0].submissions).toHaveLength(2)
    expect(resub.body.data.milestones[0].onTime).toBe(true)

    const ap1 = await call(deal, "POST", `/deals/${id}/milestones/${m1.id}/approve`, b.token)
    expect(ap1.status).toBe(200)
    expect(ap1.body.data.milestones[0].status).toBe("RELEASED")
    expect(ap1.body.meta?.release).toMatchObject({ status: "PAID", net: 8800 - 440 })
    expect(ap1.body.data.status).toBe("IN_PROGRESS")

    await call(deal, "POST", `/deals/${id}/milestones/${m2.id}/submit`, c.token, { url: "https://example.com/live", note: "Live now" })
    const ap2 = await call(deal, "POST", `/deals/${id}/milestones/${m2.id}/approve`, b.token)
    expect(ap2.body.data.status).toBe("COMPLETED")
    expect(ap2.body.data.allowedActions).toEqual(["REVIEW"])

    // Replayed release events are no-ops
    for (const e of await outbox(id, TOPICS.PAYMENT_RELEASED)) await handleEvent(e)
    expect(await outbox(id, TOPICS.DEAL_COMPLETED)).toHaveLength(1)

    const pay = await call<{ escrow: { status: string; availableAmount: number }; payouts: { status: string; net: number }[]; ledger: { type: string }[] }>(payment, "GET", `/payments/deals/${id}`, c.token)
    expect(pay.body.data.escrow).toMatchObject({ status: "RELEASED", availableAmount: 0 })
    expect(pay.body.data.payouts.map((p) => p.status)).toEqual(["PAID", "PAID"])
    expect(pay.body.data.ledger.map((l) => l.type)).not.toContain("BRAND_FEE")
    expect((await call(payment, "GET", `/payments/deals/${id}`, outsider.token)).status).toBe(403)

    // Reviews
    expect((await call(deal, "POST", `/deals/${id}/reviews`, b.token, { rating: 5, comment: "Great" })).status).toBe(201)
    expect((await call(deal, "POST", `/deals/${id}/reviews`, b.token, { rating: 4 })).status).toBe(409)
    const profile = await prisma.creatorProfile.findUniqueOrThrow({ where: { id: c.creator.id } })
    expect(profile).toMatchObject({ completedDeals: 1, avgRating: 5, onTimeRate: 1, revisionRate: 0.5 })
  })

  it("applies the fraud hold and refuses funding while it is active", async () => {
    const b = await makeBrand({ ageDays: 2 })
    const c = await makeCreator()
    const created = await call(deal, "POST", "/deals", b.token, offerBody(c.creator.id, 150_000))
    const id = created.body.data.id
    expect(created.body.data.holdUntil).toBeTruthy()
    expect(await prisma.fraudFlag.count({ where: { dealId: id, source: "RULE", subject: "DEAL" } })).toBe(1)
    await call(deal, "POST", `/deals/${id}/accept`, c.token)
    await call(deal, "POST", `/deals/${id}/contract/sign`, b.token, { signerName: b.user.name })
    await call(deal, "POST", `/deals/${id}/contract/sign`, c.token, { signerName: c.user.name })
    const res = await call(payment, "POST", `/payments/deals/${id}/intent`, b.token)
    expect(res.status).toBe(409)
    expect(res.body.error?.details).toMatchObject({ reason: "FRAUD_HOLD" })
  })

  it("gates upfront mode on reliability > 85 and brand KYC", async () => {
    const unverified = await makeBrand()
    const verified = await makeBrand({ kycStatus: "VERIFIED" })
    const reliable = await makeCreator({ reliability: 90 })
    const unscored = await makeCreator()
    const body = (creatorId: string) => ({ ...offerBody(creatorId), paymentMode: "UPFRONT", milestones: [] })
    expect((await call(deal, "POST", "/deals", unverified.token, body(reliable.creator.id))).status).toBe(422)
    expect((await call(deal, "POST", "/deals", verified.token, body(unscored.creator.id))).status).toBe(422)
    expect((await call(deal, "POST", "/deals", verified.token, body(reliable.creator.id))).status).toBe(201)
  })

  it("dispute freezes releases; resolution settles milestones and the deal", async () => {
    const { b, c, id, detail } = await fundedDeal()
    const admin = await makeAdmin()
    const [m1, m2] = detail.milestones

    // Release fails while payment-service is down → milestone stays APPROVED, error surfaces.
    await call(deal, "POST", `/deals/${id}/milestones/${m1.id}/submit`, c.token, { url: "https://example.com/a", note: "v1" })
    process.env.PAYMENT_SERVICE_URL = await deadUrl()
    const failed = await call(deal, "POST", `/deals/${id}/milestones/${m1.id}/approve`, b.token)
    expect(failed.status).toBe(503)
    process.env.PAYMENT_SERVICE_URL = paymentUrl
    expect((await prisma.milestone.findUniqueOrThrow({ where: { id: m1.id } })).status).toBe("APPROVED")

    // Creator disputes milestone 2 → escrow frozen, deal DISPUTED.
    const disputed = await call(deal, "POST", `/deals/${id}/disputes`, c.token, { reason: "Brand changed the brief after approval", milestoneId: m2.id })
    expect(disputed.status).toBe(201)
    expect(disputed.body.data.status).toBe("DISPUTED")
    expect(disputed.body.data.milestones[1].status).toBe("DISPUTED")
    const disputeId = (disputed.body.meta?.dispute as { id: string }).id
    expect((await prisma.escrowAccount.findUniqueOrThrow({ where: { dealId: id } })).status).toBe("FROZEN")
    expect(await outbox(id, TOPICS.DISPUTE_OPENED)).toHaveLength(1)

    // Releases are refused while frozen (retry via internal endpoint and direct payment call).
    const retry = await call(deal, "POST", `/internal/deals/${id}/milestones/${m1.id}/retry-release`, null, undefined, internal())
    expect(retry.status).toBe(409)
    const direct = await call(payment, "POST", `/internal/payments/milestones/${m1.id}/release`, null, {}, internal())
    expect(direct.status).toBe(409)
    expect(direct.body.error?.details).toMatchObject({ escrowStatus: "FROZEN" })
    expect((await call(payment, "POST", `/internal/payments/milestones/${m1.id}/release`, null, {})).status).toBe(403)

    // Admin refunds milestone 2 to the brand.
    expect((await call(payment, "POST", `/admin/disputes/${disputeId}/resolve`, b.token, { resolution: "REFUND_TO_BRAND", note: "x" })).status).toBe(403)
    const resolved = await call<{ refunds: { amount: number }[] }>(payment, "POST", `/admin/disputes/${disputeId}/resolve`, admin.token, { resolution: "REFUND_TO_BRAND", note: "Brief change was not agreed in writing" })
    expect(resolved.status).toBe(200)
    expect(resolved.body.data.refunds.map((r) => r.amount)).toEqual([m2.amount])

    // dispute.resolved first: deal back to IN_PROGRESS and the blocked release goes through.
    await consume(id, TOPICS.DISPUTE_RESOLVED)
    let d = (await call(deal, "GET", `/deals/${id}`, b.token)).body.data
    expect(d.milestones.map((m) => m.status)).toEqual(["RELEASED", "DISPUTED"])
    expect(d.status).toBe("IN_PROGRESS")
    // then the refund event settles milestone 2 → COMPLETED
    await consume(id, TOPICS.PAYMENT_REFUNDED)
    await consume(id, TOPICS.PAYMENT_REFUNDED)
    d = (await call(deal, "GET", `/deals/${id}`, b.token)).body.data
    expect(d.milestones.map((m) => m.status)).toEqual(["RELEASED", "REFUNDED"])
    expect(d.status).toBe("COMPLETED")
    expect((await prisma.escrowAccount.findUniqueOrThrow({ where: { dealId: id } })).status).toBe("RELEASED")
  })

  it("rejects disputes outside the 72h window and on unfunded deals", async () => {
    const { b, c, id, detail } = await fundedDeal()
    const m1 = detail.milestones[0]
    await call(deal, "POST", `/deals/${id}/milestones/${m1.id}/submit`, c.token, { url: "https://example.com/a", note: "v1" })
    await prisma.deliverable.updateMany({ where: { milestoneId: m1.id }, data: { createdAt: new Date(Date.now() - 73 * 3_600_000) } })
    const late = await call(deal, "POST", `/deals/${id}/disputes`, b.token, { reason: "Deliverable does not match the brief", milestoneId: m1.id })
    expect(late.status).toBe(409)
    expect(late.body.error?.details).toMatchObject({ windowHours: 72 })

    const b2 = await makeBrand()
    const c2 = await makeCreator()
    const fresh = await call(deal, "POST", "/deals", b2.token, offerBody(c2.creator.id))
    expect((await call(deal, "POST", `/deals/${fresh.body.data.id}/disputes`, c2.token, { reason: "Not even funded yet here" })).status).toBe(409)
  })
})

describe("briefs & applications (AI stubbed)", () => {
  it("publishes despite AI outage, proxies parse/match, scores applications", async () => {
    const b = await makeBrand()
    const c = await makeCreator()
    const other = await makeBrand()
    const briefBody = { title: "Monsoon skincare launch", description: "Looking for beauty creators for a 3-week campaign", niche: "beauty", platforms: ["INSTAGRAM"], budgetPerCreator: 25_000 }

    const created = await call<{ id: string; status: string }>(deal, "POST", "/briefs", b.token, briefBody)
    expect(created.status).toBe(201)
    const briefId = created.body.data.id
    expect((await call(deal, "PATCH", `/briefs/${briefId}`, other.token, { title: "Hijack attempt" })).status).toBe(403)

    // AI down: publish still succeeds, parse and matches return 503.
    process.env.AI_SERVICE_URL = await deadUrl()
    const published = await call<{ status: string; publishedAt: string }>(deal, "POST", `/briefs/${briefId}/publish`, b.token)
    expect(published.status).toBe(200)
    expect(published.body.data.status).toBe("PUBLISHED")
    expect(published.body.meta).toEqual({ aiEmbedding: "failed" })
    expect(await outbox(briefId, TOPICS.BRIEF_PUBLISHED)).toHaveLength(1)
    expect((await call(deal, "POST", "/briefs/parse", b.token, { text: "We need 5 fitness creators in Mumbai for a protein bar launch" })).status).toBe(503)
    expect((await call(deal, "GET", `/briefs/${briefId}/matches`, b.token)).status).toBe(503)
    expect((await call(deal, "DELETE", `/briefs/${briefId}`, b.token)).status).toBe(409)

    // Unscored when AI is down.
    const applied = await call<{ id: string; scoredAt: string | null }>(deal, "POST", `/briefs/${briefId}/applications`, c.token, { pitch: "I run a skincare channel with 80k engaged followers.", proposedRate: 22_000 })
    expect(applied.status).toBe(201)
    expect(applied.body.data.scoredAt).toBeNull()
    expect(applied.body.meta).toEqual({ aiScoring: "failed" })
    expect((await call(deal, "POST", `/briefs/${briefId}/applications`, c.token, { pitch: "Applying twice to the same brief here.", proposedRate: 1000 })).status).toBe(409)

    // AI up.
    const stub = await startAiStub({
      "/ai/parse-brief": () => ({ json: { title: "Protein bar launch", niche: "fitness", confidence: { title: 0.9 }, source: "rules" } }),
      "/ai/match": () => ({ json: [{ creator_id: c.creator.id, match_score: 87, match_reasons: ["Niche fit"], disqualifiers: [], components: { niche: 0.9 } }, { creator_id: crypto.randomUUID(), match_score: 50 }] }),
      "/ai/applications/score": () => ({ json: { match_score: 78, match_reasons: ["Audience overlap"], disqualifiers: [], model_version: "v-test" } }),
      "/ai/embeddings/briefs/*": () => ({ json: { ok: true } }),
    })
    process.env.AI_SERVICE_URL = stub.url
    try {
      const parsed = await call<{ niche: string }>(deal, "POST", "/briefs/parse", b.token, { text: "We need 5 fitness creators in Mumbai for a protein bar launch" })
      expect(parsed.body.data.niche).toBe("fitness")
      const matches = await call<{ matches: { creator: { id: string; handle: string }; matchScore: number }[] }>(deal, "GET", `/briefs/${briefId}/matches`, b.token)
      expect(matches.body.data.matches).toHaveLength(1)
      expect(matches.body.data.matches[0]).toMatchObject({ creator: { id: c.creator.id, handle: c.creator.handle }, matchScore: 87 })
      expect(stub.calls.every((x) => x.token === process.env.INTERNAL_SERVICE_TOKEN)).toBe(true)

      const withdrawn = await call<{ status: string }>(deal, "POST", `/applications/${applied.body.data.id}/withdraw`, c.token)
      expect(withdrawn.body.data.status).toBe("WITHDRAWN")
      const reapplied = await call<{ id: string; matchScore: number; scoredAt: string }>(deal, "POST", `/briefs/${briefId}/applications`, c.token, { pitch: "Reapplying with an updated media kit and rates.", proposedRate: 21_000 })
      expect(reapplied.status).toBe(201)
      expect(reapplied.body.meta).toEqual({ aiScoring: "scored" })
      expect(reapplied.body.data.matchScore).toBe(78)

      const shortlisted = await call<{ status: string }>(deal, "PATCH", `/applications/${reapplied.body.data.id}/status`, b.token, { status: "SHORTLISTED" })
      expect(shortlisted.body.data.status).toBe("SHORTLISTED")
      expect((await call(deal, "PATCH", `/applications/${reapplied.body.data.id}/status`, other.token, { status: "REJECTED" })).status).toBe(403)
      expect(await outbox(briefId, TOPICS.APPLICATION_STATUS_CHANGED)).toHaveLength(2)

      const open = await call<{ id: string; myApplication: { status: string } | null }[]>(deal, "GET", `/briefs/open?niche=beauty&platform=INSTAGRAM&minBudget=20000&q=monsoon`, c.token)
      const hit = open.body.data.find((x) => x.id === briefId)
      expect(hit?.myApplication?.status).toBe("SHORTLISTED")

      const list = await call<{ id: string; creator: { handle: string } }[]>(deal, "GET", `/briefs/${briefId}/applications`, b.token)
      expect(list.body.data.map((a) => a.creator.handle)).toEqual([c.creator.handle])
    } finally {
      await stub.close()
      delete process.env.AI_SERVICE_URL
    }
  })
})
