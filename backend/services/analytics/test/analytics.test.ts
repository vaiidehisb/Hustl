import "./setup"
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { FastifyInstance } from "fastify"
import { prisma, type DealStatus } from "@hustl/db"
import { signAccessToken } from "@hustl/common"
import { buildApp } from "../src/app"
import { stageDurations } from "../src/queries"

const H = 3_600_000
const DAY = 24 * H
let app: FastifyInstance
const tag = `an${randomUUID().slice(0, 8)}`
const userIds: string[] = []
const dealIds: string[] = []
const tokens: Record<string, string> = {}
const ids: Record<string, string> = {}

async function user(key: string, role: "BRAND" | "CREATOR" | "ADMIN") {
  const u = await prisma.user.create({ data: { email: `${tag}-${key}@test.hustl.local`, name: `${tag} ${key}`, role } })
  userIds.push(u.id)
  tokens[key] = signAccessToken({ id: u.id, email: u.email, role })
  ids[`user_${key}`] = u.id
  return u
}

const dealBase = { currency: "INR", paymentMode: "MILESTONES" as const, brandFeeRate: 0.08, creatorFeeRate: 0.05, processingFeeRate: 0.02 }
const ADMIN_WINDOW = { from: "2003-03-03T03:00:00.000Z", to: "2003-03-03T03:10:00.000Z" }

async function events(dealId: string, start: Date, steps: [DealStatus, number][]) {
  for (const [status, hours] of steps) await prisma.dealEvent.create({ data: { dealId, type: "status", toStatus: status, createdAt: new Date(start.getTime() + hours * H) } })
}

beforeAll(async () => {
  app = await buildApp()
  const brandUser = await user("brand", "BRAND")
  const c1User = await user("c1", "CREATOR")
  const c2User = await user("c2", "CREATOR")
  const c3User = await user("c3", "CREATOR")
  await user("admin", "ADMIN")
  const brand2User = await user("brand2", "BRAND")

  const brand = await prisma.brandProfile.create({ data: { userId: brandUser.id, slug: `${tag}-b`, companyName: `${tag} Brand` } })
  const brand2 = await prisma.brandProfile.create({ data: { userId: brand2User.id, slug: `${tag}-b2`, companyName: `${tag} Brand2` } })
  const [c1, c2, c3] = await Promise.all(
    [c1User, c2User, c3User].map((u, i) => prisma.creatorProfile.create({ data: { userId: u.id, handle: `${tag}_c${i + 1}` } })),
  )
  ids.c1 = c1.id
  await prisma.creatorScore.create({ data: { creatorId: c1.id, trustScore: 77, nicheAuthority: 60, reliabilityScore: 88, authenticityScore: 91, modelVersion: "t" } })

  const brief = await prisma.brief.create({ data: { brandId: brand.id, title: `${tag} Campaign`, description: "d", budgetPerCreator: 10000, status: "PUBLISHED", publishedAt: new Date() } })
  await prisma.brief.create({ data: { brandId: brand.id, title: `${tag} Draft`, description: "d", budgetPerCreator: 1000 } })
  ids.brief = brief.id
  const appOffered = await prisma.application.create({ data: { briefId: brief.id, creatorId: c1.id, pitch: "p", proposedRate: 10000, status: "OFFERED", matchScore: 100 } })
  await prisma.application.create({ data: { briefId: brief.id, creatorId: c2.id, pitch: "p", proposedRate: 9000, status: "SHORTLISTED", matchScore: 80 } })
  await prisma.application.create({ data: { briefId: brief.id, creatorId: c3.id, pitch: "p", proposedRate: 8000, status: "APPLIED", matchScore: 60 } })

  // Deal 1: completed, funded 48h after offer, one milestone delivered on time with a revision.
  const start1 = new Date(Date.now() - 10 * DAY)
  const d1 = await prisma.deal.create({
    data: { ...dealBase, title: "Deal 1", briefId: brief.id, applicationId: appOffered.id, brandId: brand.id, creatorId: c1.id, status: "COMPLETED", amount: 10000, createdAt: start1, completedAt: new Date(start1.getTime() + 96 * H) },
  })
  dealIds.push(d1.id)
  ids.d1 = d1.id
  await events(d1.id, start1, [["OFFER_SENT", 0], ["AGREED", 12], ["CONTRACT_SIGNED", 24], ["FUNDED", 48], ["IN_PROGRESS", 48], ["COMPLETED", 96]])
  const m1 = await prisma.milestone.create({
    data: { dealId: d1.id, position: 1, title: "Reel", percent: 100, amount: 10000, dueDate: new Date(start1.getTime() + 80 * H), status: "RELEASED", revisionCount: 1, submittedAt: new Date(start1.getTime() + 90 * H) },
  })
  // First submission (on time); submittedAt above is the later resubmission.
  await prisma.deliverable.create({ data: { milestoneId: m1.id, url: "https://example.com/v1", createdAt: new Date(start1.getTime() + 60 * H) } })
  await prisma.ledgerEntry.createMany({
    data: [
      { dealId: d1.id, type: "ESCROW_FUND", amount: 10000, provider: "TEST" },
      { dealId: d1.id, type: "BRAND_FEE", amount: 800, provider: "TEST" },
      { dealId: d1.id, type: "PROCESSING_FEE", amount: 200, provider: "TEST" },
      { dealId: d1.id, milestoneId: m1.id, type: "RELEASE", amount: 9500, provider: "TEST" },
      { dealId: d1.id, milestoneId: m1.id, type: "CREATOR_FEE", amount: 500, provider: "TEST" },
    ],
  })
  await prisma.escrowAccount.create({ data: { dealId: d1.id, provider: "TEST", status: "RELEASED", fundedAmount: 10000, releasedAmount: 10000 } })
  await prisma.payout.create({ data: { dealId: d1.id, milestoneId: m1.id, creatorId: c1.id, gross: 10000, fee: 500, net: 9500, status: "PAID", provider: "TEST", paidAt: new Date() } })
  await prisma.review.create({ data: { dealId: d1.id, authorId: brandUser.id, subjectUserId: c1User.id, rating: 4, comment: "Great" } })

  // Deal 2: in progress, funded 24h after offer, milestone approved but late.
  const start2 = new Date(Date.now() - 5 * DAY)
  const d2 = await prisma.deal.create({ data: { ...dealBase, title: "Deal 2", brandId: brand.id, creatorId: c1.id, status: "IN_PROGRESS", amount: 5000, createdAt: start2 } })
  dealIds.push(d2.id)
  await events(d2.id, start2, [["FUNDED", 24], ["IN_PROGRESS", 25]])
  await prisma.milestone.create({
    data: { dealId: d2.id, position: 1, title: "Post", percent: 100, amount: 5000, dueDate: new Date(start2.getTime() + 30 * H), submittedAt: new Date(start2.getTime() + 40 * H), status: "APPROVED" },
  })
  await prisma.ledgerEntry.createMany({
    data: [
      { dealId: d2.id, type: "ESCROW_FUND", amount: 5000, provider: "TEST" },
      { dealId: d2.id, type: "BRAND_FEE", amount: 400, provider: "TEST" },
      { dealId: d2.id, type: "PROCESSING_FEE", amount: 100, provider: "TEST" },
    ],
  })
  await prisma.escrowAccount.create({ data: { dealId: d2.id, provider: "TEST", status: "FUNDED", fundedAmount: 5000 } })

  // Deal 3: offer only, from the brief, to another creator.
  const d3 = await prisma.deal.create({ data: { ...dealBase, title: "Deal 3", briefId: brief.id, brandId: brand.id, creatorId: c2.id, amount: 3000 } })
  dealIds.push(d3.id)

  // Deal 4 (other brand): ledger rows in a fixed historical window for platform metrics.
  const d4 = await prisma.deal.create({ data: { ...dealBase, title: "Deal 4", brandId: brand2.id, creatorId: c3.id, status: "COMPLETED", amount: 20000 } })
  dealIds.push(d4.id)
  const at = new Date("2003-03-03T03:03:03.000Z")
  await prisma.ledgerEntry.createMany({
    data: [
      { dealId: d4.id, type: "ESCROW_FUND", amount: 20000, provider: "TEST", createdAt: at },
      { dealId: d4.id, type: "BRAND_FEE", amount: 1000, provider: "TEST", createdAt: at },
      { dealId: d4.id, type: "PROCESSING_FEE", amount: 400, provider: "TEST", createdAt: at },
      { dealId: d4.id, type: "CREATOR_FEE", amount: 1000, provider: "TEST", createdAt: at },
    ],
  })
})

afterAll(async () => {
  await prisma.ledgerEntry.deleteMany({ where: { dealId: { in: dealIds } } })
  await prisma.payout.deleteMany({ where: { dealId: { in: dealIds } } })
  await prisma.escrowAccount.deleteMany({ where: { dealId: { in: dealIds } } })
  await prisma.deal.deleteMany({ where: { id: { in: dealIds } } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  await app.close()
  await prisma.$disconnect()
})

const get = (url: string, token?: string) => app.inject({ method: "GET", url, headers: token ? { authorization: `Bearer ${token}` } : {} })

describe("brand analytics", () => {
  it("computes the overview from ledger, escrow and deal events", async () => {
    const res = await get("/analytics/brand/overview", tokens.brand)
    expect(res.statusCode).toBe(200)
    const data = res.json().data
    expect(data.totalSpend).toBe(16500)
    expect(data.spendBreakdown).toEqual({ escrowFunded: 15000, brandFees: 1200, processingFees: 300 })
    expect(data.escrowHeld).toBe(5000)
    expect(data.dealsByStatus).toMatchObject({ COMPLETED: 1, IN_PROGRESS: 1, OFFER_SENT: 1, FUNDED: 0 })
    expect(data.totalDeals).toBe(3)
    expect(data.avgHoursToFund).toBe(36)
    expect(data.activeBriefs).toBe(1)
    expect(data.monthlySpend).toHaveLength(12)
    const now = new Date()
    const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
    expect(data.monthlySpend[11]).toEqual({ month: thisMonth, amount: 16500 })
    expect(data.monthlySpend.slice(0, 11).every((p: { amount: number }) => p.amount === 0)).toBe(true)
  })

  it("respects from/to and validates the range", async () => {
    const res = await get(`/analytics/brand/overview?from=${new Date(Date.now() + DAY).toISOString()}`, tokens.brand)
    expect(res.json().data).toMatchObject({ totalSpend: 0, totalDeals: 0, avgHoursToFund: null })
    expect((await get("/analytics/brand/overview?from=2026-02-01&to=2026-01-01", tokens.brand)).statusCode).toBe(422)
    expect((await get("/analytics/brand/overview?from=not-a-date", tokens.brand)).statusCode).toBe(422)
    expect((await get("/analytics/brand/overview", tokens.c1)).statusCode).toBe(403)
  })

  it("reports per-campaign funnel and spend", async () => {
    const res = await get("/analytics/brand/campaigns", tokens.brand)
    expect(res.statusCode).toBe(200)
    expect(res.json().meta).toMatchObject({ total: 2 })
    const campaign = res.json().data.find((c: { briefId: string }) => c.briefId === ids.brief)
    expect(campaign).toMatchObject({ applications: 3, shortlisted: 2, offers: 2, deals: 1, spend: 11000, avgMatchScore: 80, status: "PUBLISHED" })
  })
})

describe("creator analytics", () => {
  it("computes earnings, pending, win/on-time/revision rates and scores", async () => {
    const res = await get("/analytics/creator/overview", tokens.c1)
    expect(res.statusCode).toBe(200)
    const data = res.json().data
    expect(data.totalEarned).toBe(9500)
    expect(data.monthlyEarnings[11].amount).toBe(9500)
    expect(data.pending).toEqual({ payoutsPending: 0, approvedAwaitingRelease: 5000, inEscrow: 5000, total: 5000 })
    expect(data.applications).toEqual({ total: 1, offered: 1, winRate: 1 })
    expect(data.onTimeRate).toBe(0.5)
    expect(data.revisionRate).toBe(0.5)
    expect(data).toMatchObject({ avgRating: 4, reviewCount: 1, completedDeals: 1, activeDeals: 1 })
    expect(data.scores).toMatchObject({ trustScore: 77, reliabilityScore: 88, authenticityScore: 91 })
    expect((await get("/analytics/creator/overview", tokens.brand)).statusCode).toBe(403)
  })
})

describe("deal analytics", () => {
  it("is party-only and computes stage durations", async () => {
    expect((await get(`/analytics/deals/${ids.d1}`)).statusCode).toBe(401)
    expect((await get(`/analytics/deals/${ids.d1}`, tokens.c2)).statusCode).toBe(403)
    expect((await get(`/analytics/deals/${randomUUID()}`, tokens.admin)).statusCode).toBe(404)
    for (const t of [tokens.brand, tokens.c1, tokens.admin]) expect((await get(`/analytics/deals/${ids.d1}`, t)).statusCode).toBe(200)

    const data = (await get(`/analytics/deals/${ids.d1}`, tokens.brand)).json().data
    expect(data.stages.map((s: { status: string; durationHours: number }) => [s.status, s.durationHours])).toEqual([
      ["OFFER_SENT", 12],
      ["AGREED", 12],
      ["CONTRACT_SIGNED", 24],
      ["FUNDED", 0],
      ["IN_PROGRESS", 48],
      ["COMPLETED", 0],
    ])
    expect(data.totalHours).toBe(96)
    expect(data.milestones[0]).toMatchObject({ onTime: true, revisionCount: 1 })
    expect(data.milestoneOnTimeRate).toBe(1)
    expect(data.money).toEqual({ escrowFunded: 10000, brandFees: 800, processingFees: 200, released: 9500, creatorFees: 500, refunded: 0 })

    const report = (await get(`/analytics/deals/${ids.d1}/report`, tokens.c1)).json().data
    expect(report.brand.name).toBe(`${tag} Brand`)
    expect(report.ledger).toHaveLength(5)
    expect(report.reviews).toEqual([expect.objectContaining({ rating: 4, authorRole: "BRAND" })])
  })

  it("adds an implicit OFFER_SENT stage and measures open stages until now", () => {
    const created = new Date("2026-01-01T00:00:00Z")
    const now = new Date("2026-01-03T00:00:00Z")
    const stages = stageDurations({ createdAt: created, status: "FUNDED" }, [{ toStatus: "FUNDED", createdAt: new Date("2026-01-02T00:00:00Z") }], now)
    expect(stages).toEqual([
      { status: "OFFER_SENT", enteredAt: created.toISOString(), exitedAt: "2026-01-02T00:00:00.000Z", durationHours: 24 },
      { status: "FUNDED", enteredAt: "2026-01-02T00:00:00.000Z", exitedAt: null, durationHours: 24 },
    ])
  })
})

describe("admin metrics", () => {
  it("computes GMV, revenue and take rate for a range", async () => {
    expect((await get("/admin/metrics", tokens.brand)).statusCode).toBe(403)
    const res = await get(`/admin/metrics?from=${ADMIN_WINDOW.from}&to=${ADMIN_WINDOW.to}`, tokens.admin)
    expect(res.statusCode).toBe(200)
    const data = res.json().data
    expect(data).toMatchObject({ gmv: 20000, platformRevenue: 2000, revenueBreakdown: { brandFees: 1000, creatorFees: 1000 }, takeRate: 0.1 })
    expect(data.users.byRole.CREATOR).toBeGreaterThanOrEqual(3)
    expect(data.users.total).toBeGreaterThanOrEqual(6)
    expect(data.activeDeals).toBeGreaterThanOrEqual(1)
    expect(typeof data.openDisputes).toBe("number")
    expect(typeof data.openFraudFlags).toBe("number")
  })
})
