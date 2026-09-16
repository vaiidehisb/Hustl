import "./setup"
import { randomUUID } from "node:crypto"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { FastifyInstance } from "fastify"
import { prisma } from "@hustl/db"
import { signAccessToken, TOPICS } from "@hustl/common"
import { buildApp } from "../src/app"
import { detectSpike, followerGrowth30d, followersTotal, followerWeightedEngagement } from "../src/normalise"
import { handleCreatorEvent } from "../src/orchestration"
import { verifyWebhookSignature, engagementFromContents } from "../src/integrations/phyllo"
import { createHmac } from "node:crypto"

let app: FastifyInstance
const userIds: string[] = []
const creatorIds: string[] = []

async function makeUser(role: "BRAND" | "CREATOR" | "ADMIN") {
  const tag = randomUUID().slice(0, 8)
  const user = await prisma.user.create({ data: { email: `cd-${tag}@test.hustl.local`, name: `CD ${role} ${tag}`, role } })
  userIds.push(user.id)
  let creatorId: string | undefined
  if (role === "CREATOR") {
    const c = await prisma.creatorProfile.create({ data: { userId: user.id, handle: `cd_${tag}` } })
    creatorId = c.id
    creatorIds.push(c.id)
  }
  return { user, creatorId: creatorId!, token: signAccessToken({ id: user.id, email: user.email, role }) }
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` })

beforeAll(async () => {
  app = await buildApp()
})

afterAll(async () => {
  await prisma.outboxEvent.deleteMany({ where: { key: { in: creatorIds } } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  await app.close()
  await prisma.$disconnect()
})

describe("normalisation math", () => {
  it("computes follower-weighted engagement", () => {
    const accounts = [
      { followers: 1000, engagementRate: 0.05 },
      { followers: 3000, engagementRate: 0.01 },
      { followers: 500, engagementRate: null },
      { followers: 0, engagementRate: 0.9 },
    ]
    expect(followerWeightedEngagement(accounts)).toBeCloseTo((1000 * 0.05 + 3000 * 0.01) / 4000, 10)
    expect(followersTotal(accounts)).toBe(4500)
    expect(followerWeightedEngagement([{ followers: 0, engagementRate: 0.1 }])).toBeNull()
  })

  it("computes 30-day growth from the oldest snapshot in the window", () => {
    const now = new Date("2026-09-15T00:00:00Z")
    const d = (days: number) => new Date(now.getTime() - days * 86400000)
    const snaps = [
      { socialAccountId: "a", followers: 500, capturedAt: d(45) }, // outside window
      { socialAccountId: "a", followers: 800, capturedAt: d(25) },
      { socialAccountId: "a", followers: 900, capturedAt: d(10) },
      { socialAccountId: "a", followers: 1000, capturedAt: d(0) },
      { socialAccountId: "b", followers: 200, capturedAt: d(20) },
      { socialAccountId: "b", followers: 100, capturedAt: d(1) },
      { socialAccountId: "c", followers: 999, capturedAt: d(1) }, // single snapshot → no history
    ]
    expect(followerGrowth30d(snaps, now)).toBeCloseTo((1000 + 100 - (800 + 200)) / (800 + 200), 10)
    expect(followerGrowth30d([{ socialAccountId: "x", followers: 10, capturedAt: d(1) }], now)).toBeNull()
  })

  it("detects >20% spikes between consecutive snapshots", () => {
    expect(detectSpike(null, 100)).toBeNull()
    expect(detectSpike({ followers: 1000 }, 1200)).toBeNull()
    expect(detectSpike({ followers: 1000 }, 1201)).toBeCloseTo(0.201)
    expect(detectSpike({ followers: 1000 }, 700)).toBeCloseTo(-0.3)
  })

  it("derives engagement from Phyllo contents without inventing values", () => {
    expect(engagementFromContents([], 1000)).toEqual({ avgLikes: null, avgComments: null, avgViews: null, engagementRate: null })
    const r = engagementFromContents(
      [
        { id: "1", engagement: { like_count: 40, comment_count: 10, view_count: 1000 } },
        { id: "2", engagement: { like_count: 60, comment_count: 10, view_count: null } },
      ],
      1000,
    )
    expect(r).toEqual({ avgLikes: 50, avgComments: 10, avgViews: 1000, engagementRate: 0.06 })
  })

  it("verifies webhook HMAC signatures", () => {
    const body = Buffer.from('{"event":"ACCOUNTS.CONNECTED"}')
    const sig = createHmac("sha256", "s3cret").update(body).digest("hex")
    expect(verifyWebhookSignature(body, sig, "s3cret")).toBe(true)
    expect(verifyWebhookSignature(body, sig, "other")).toBe(false)
    expect(verifyWebhookSignature(body, undefined, "s3cret")).toBe(false)
  })
})

describe("Phyllo without credentials", () => {
  it("reports configuration and returns 503 on every Phyllo endpoint", async () => {
    const { token } = await makeUser("CREATOR")
    const providers = await app.inject({ method: "GET", url: "/social/providers" })
    expect(providers.json().data.phyllo).toMatchObject({ configured: false, missingEnv: ["PHYLLO_CLIENT_ID", "PHYLLO_CLIENT_SECRET"] })

    for (const url of ["/social/phyllo/sdk-token", "/social/accounts/me/sync"]) {
      const res = await app.inject({ method: "POST", url, headers: auth(token) })
      expect(res.statusCode).toBe(503)
      expect(res.json().error).toMatchObject({ code: "INTEGRATION_UNAVAILABLE", details: { integration: "Phyllo" } })
    }
    const hook = await app.inject({ method: "POST", url: "/social/phyllo/webhook", payload: { event: "ACCOUNTS.CONNECTED" } })
    expect(hook.statusCode).toBe(503)
    expect(hook.json().error.details.missingEnv).toContain("PHYLLO_WEBHOOK_SECRET")
  })
})

describe("self-reported accounts", () => {
  it("validates input", async () => {
    const { token } = await makeUser("CREATOR")
    const bad = [
      { platform: "INSTAGRAM", handle: "me", followers: -1, engagementRate: 3 },
      { platform: "INSTAGRAM", handle: "me", followers: 10, engagementRate: 101 },
      { platform: "MYSPACE", handle: "me", followers: 10, engagementRate: 1 },
      { platform: "YOUTUBE", handle: "me", followers: 1.5, engagementRate: 1 },
    ]
    for (const payload of bad) {
      const res = await app.inject({ method: "POST", url: "/social/accounts/self-reported", headers: auth(token), payload })
      expect(res.statusCode).toBe(422)
    }
    const brand = await makeUser("BRAND")
    const forbidden = await app.inject({ method: "POST", url: "/social/accounts/self-reported", headers: auth(brand.token), payload: bad[0] })
    expect(forbidden.statusCode).toBe(403)
  })

  it("stores unverified data, snapshots it and recomputes aggregates", async () => {
    const { token, creatorId } = await makeUser("CREATOR")
    const ig = await app.inject({
      method: "POST",
      url: "/social/accounts/self-reported",
      headers: auth(token),
      payload: { platform: "INSTAGRAM", handle: "@alice", followers: 1000, engagementRate: 5 },
    })
    expect(ig.statusCode).toBe(201)
    expect(ig.json().data).toMatchObject({ source: "SELF_REPORTED", verified: false, handle: "alice", followers: 1000, engagementRate: 0.05 })

    const yt = await app.inject({
      method: "POST",
      url: "/social/accounts/self-reported",
      headers: auth(token),
      payload: { platform: "YOUTUBE", handle: "alice", followers: 3000, engagementRate: 1, avgViews: 1200 },
    })
    expect(yt.statusCode).toBe(201)

    const profile = await prisma.creatorProfile.findUniqueOrThrow({ where: { id: creatorId } })
    expect(profile.followersTotal).toBe(4000)
    expect(profile.engagementRate).toBeCloseTo(0.02, 10)
    expect(profile.followerGrowth30d).toBeNull()
    expect(await prisma.socialMetricSnapshot.count({ where: { socialAccount: { creatorId } } })).toBe(2)

    const events = await prisma.outboxEvent.findMany({ where: { topic: TOPICS.CREATOR_METRICS_UPDATED, key: creatorId } })
    expect(events).toHaveLength(2)
  })

  it("computes growth from history and flags follower spikes", async () => {
    const { token, creatorId } = await makeUser("CREATOR")
    const first = await app.inject({
      method: "POST",
      url: "/social/accounts/self-reported",
      headers: auth(token),
      payload: { platform: "TIKTOK", handle: "bob", followers: 800, engagementRate: 2 },
    })
    const accountId = first.json().data.id
    // Move the first snapshot 20 days back.
    await prisma.socialMetricSnapshot.updateMany({ where: { socialAccountId: accountId }, data: { capturedAt: new Date(Date.now() - 20 * 86400000) } })

    const second = await app.inject({
      method: "POST",
      url: "/social/accounts/self-reported",
      headers: auth(token),
      payload: { platform: "TIKTOK", handle: "bob", followers: 1000, engagementRate: 2 },
    })
    expect(second.statusCode).toBe(200)
    const profile = await prisma.creatorProfile.findUniqueOrThrow({ where: { id: creatorId } })
    expect(profile.followerGrowth30d).toBeCloseTo(0.25, 10)

    const last = await prisma.outboxEvent.findFirstOrThrow({ where: { topic: TOPICS.CREATOR_METRICS_UPDATED, key: creatorId }, orderBy: { id: "desc" } })
    const payload = last.payload as { spikes: { change: number; previousFollowers: number; currentFollowers: number }[] }
    expect(payload.spikes).toHaveLength(1)
    expect(payload.spikes[0]).toMatchObject({ previousFollowers: 800, currentFollowers: 1000 })
    expect(payload.spikes[0].change).toBeCloseTo(0.25)
  })

  it("authorises metrics: self, brands and admins only", async () => {
    const owner = await makeUser("CREATOR")
    await app.inject({
      method: "POST",
      url: "/social/accounts/self-reported",
      headers: auth(owner.token),
      payload: { platform: "X", handle: "carol", followers: 50, engagementRate: 1.5 },
    })
    const url = `/social/creators/${owner.creatorId}/metrics`
    const other = await makeUser("CREATOR")
    const brand = await makeUser("BRAND")
    const admin = await makeUser("ADMIN")

    expect((await app.inject({ method: "GET", url })).statusCode).toBe(401)
    expect((await app.inject({ method: "GET", url, headers: auth(other.token) })).statusCode).toBe(403)
    for (const t of [owner.token, brand.token, admin.token]) {
      const res = await app.inject({ method: "GET", url, headers: auth(t) })
      expect(res.statusCode).toBe(200)
      const data = res.json().data
      expect(data.aggregate).toMatchObject({ followersTotal: 50, selfReportedFollowers: 50, verifiedFollowers: 0 })
      expect(data.platforms[0].verified).toBe(false)
      expect(data.snapshots).toHaveLength(1)
      expect(data.score).toBeNull()
    }
    const demo = await app.inject({ method: "GET", url: `/social/creators/${owner.creatorId}/demographics`, headers: auth(brand.token) })
    expect(demo.json().data.platforms[0]).toMatchObject({ platform: "X", verified: false, demographics: null })
  })
})

describe("AI orchestration consumer", () => {
  let stub: Server
  let calls: string[] = []
  let flags: { code: string; label: string; severity: string; source: string }[] = []

  beforeAll(async () => {
    stub = createServer((req, res) => {
      calls.push(`${req.method} ${req.url}`)
      if (req.headers["x-internal-token"] !== process.env.INTERNAL_SERVICE_TOKEN) {
        res.writeHead(403).end()
        return
      }
      req.resume()
      req.on("end", () => {
        let data: unknown = { ok: true }
        if (req.url?.startsWith("/ai/scores/refresh/"))
          data = { trust_score: 71.6, niche_authority: 55, reliability_score: 80, model_version: "test-1", signals: { a: 1 } }
        if (req.url?.startsWith("/ai/fraud/analyze-creator/")) data = { authenticity_score: 88, risk_level: "medium", flags }
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ success: true, data }))
      })
    })
    await new Promise<void>((r) => stub.listen(0, "127.0.0.1", r))
    process.env.AI_SERVICE_URL = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise<void>((r) => stub.close(() => r())))

  it("refreshes embedding, scores and fraud flags with dedupe", async () => {
    const { creatorId } = await makeUser("CREATOR")
    calls = []
    flags = [
      { code: "FOLLOWER_SPIKE", label: "Sudden follower spike", severity: "HIGH", source: "RULE" },
      { code: "LOW_ENGAGEMENT", label: "Low engagement", severity: "LOW", source: "RULE" },
    ]
    const event = { id: "1", topic: TOPICS.CREATOR_METRICS_UPDATED, key: creatorId, payload: { creatorId, spikes: [] }, createdAt: new Date().toISOString() }
    await handleCreatorEvent(event)
    expect(calls).toEqual([
      `POST /ai/embeddings/creators/${creatorId}`,
      `POST /ai/scores/refresh/${creatorId}`,
      `POST /ai/fraud/analyze-creator/${creatorId}`,
    ])
    const score = await prisma.creatorScore.findUniqueOrThrow({ where: { creatorId } })
    expect(score).toMatchObject({ trustScore: 72, nicheAuthority: 55, reliabilityScore: 80, authenticityScore: 88, modelVersion: "test-1" })

    await handleCreatorEvent(event) // replay: idempotent
    const open = await prisma.fraudFlag.findMany({ where: { creatorId, status: "OPEN" } })
    expect(open.map((f) => f.code).sort()).toEqual(["FOLLOWER_SPIKE", "LOW_ENGAGEMENT"])
    const flagged = await prisma.outboxEvent.findMany({ where: { topic: TOPICS.FRAUD_FLAGGED, key: creatorId } })
    expect(flagged).toHaveLength(1)

    // Resolve creatorId from a deal.completed-style payload.
    calls = []
    await handleCreatorEvent({ ...event, topic: TOPICS.DEAL_COMPLETED, payload: { dealId: randomUUID(), creatorId } })
    expect(calls).toHaveLength(3)

    // Admin review — no automatic action, just records the decision.
    const admin = await makeUser("ADMIN")
    const brand = await makeUser("BRAND")
    const flag = open.find((f) => f.code === "FOLLOWER_SPIKE")!
    const denied = await app.inject({ method: "POST", url: `/admin/fraud-flags/${flag.id}/review`, headers: auth(brand.token), payload: { status: "CLEARED", note: "x" } })
    expect(denied.statusCode).toBe(403)
    const list = await app.inject({ method: "GET", url: "/admin/fraud-flags?status=OPEN&pageSize=100", headers: auth(admin.token) })
    expect(list.json().data.some((f: { id: string }) => f.id === flag.id)).toBe(true)
    const review = await app.inject({
      method: "POST",
      url: `/admin/fraud-flags/${flag.id}/review`,
      headers: auth(admin.token),
      payload: { status: "CLEARED", note: "Verified giveaway campaign" },
    })
    expect(review.statusCode).toBe(200)
    expect(review.json().data).toMatchObject({ status: "CLEARED", reviewerId: admin.user.id, reviewNote: "Verified giveaway campaign" })
    const again = await app.inject({ method: "POST", url: `/admin/fraud-flags/${flag.id}/review`, headers: auth(admin.token), payload: { status: "CONFIRMED", note: "x" } })
    expect(again.statusCode).toBe(409)
    expect(await prisma.creatorProfile.count({ where: { id: creatorId, deletedAt: null } })).toBe(1)
  })

  it("throws when the AI backend is unavailable so the event is retried", async () => {
    const { creatorId } = await makeUser("CREATOR")
    const saved = process.env.AI_SERVICE_URL
    process.env.AI_SERVICE_URL = "http://127.0.0.1:1"
    try {
      await expect(
        handleCreatorEvent({ id: "2", topic: TOPICS.CREATOR_PROFILE_UPDATED, key: creatorId, payload: { creatorId }, createdAt: new Date().toISOString() }),
      ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" })
    } finally {
      process.env.AI_SERVICE_URL = saved
    }
  })
})
