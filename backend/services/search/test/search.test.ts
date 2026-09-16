import "./setup"
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { FastifyInstance } from "fastify"
import { prisma, type SocialPlatform } from "@hustl/db"
import { signAccessToken, TOPICS } from "@hustl/common"
import { searchCreatorsQuery, searchBriefsQuery } from "@hustl/contracts"
import { buildApp } from "../src/app"
import { selectEngine } from "../src/engines"
import { postgresEngine } from "../src/engines/postgres"
import { buildBriefQuery, buildCreatorQuery } from "../src/engines/elastic"
import { createIndexHandler } from "../src/indexer"

let app: FastifyInstance
const tag = `srch${randomUUID().slice(0, 8)}`
const userIds: string[] = []
let brandToken = ""
let creatorToken = ""
let adminToken = ""
const ids: Record<string, string> = {}

type CreatorSeed = {
  key: string
  niches: string[]
  platforms: SocialPlatform[]
  followers: number
  er: number | null
  location: string
  verified?: boolean
  available?: boolean
  trust?: number
  suspended?: boolean
  deleted?: boolean
}

async function user(role: "BRAND" | "CREATOR" | "ADMIN", extra: { status?: "ACTIVE" | "SUSPENDED" } = {}) {
  const u = await prisma.user.create({ data: { email: `${tag}-${randomUUID().slice(0, 6)}@test.hustl.local`, name: `${tag} ${role}`, role, ...extra } })
  userIds.push(u.id)
  return u
}

beforeAll(async () => {
  app = await buildApp(postgresEngine)
  const brandUser = await user("BRAND")
  brandToken = signAccessToken({ id: brandUser.id, email: brandUser.email, role: "BRAND" })
  const adminUser = await user("ADMIN")
  adminToken = signAccessToken({ id: adminUser.id, email: adminUser.email, role: "ADMIN" })

  const seeds: CreatorSeed[] = [
    { key: "fitA", niches: ["fitness"], platforms: ["INSTAGRAM"], followers: 50_000, er: 0.05, location: "Mumbai, IN", verified: true, trust: 60 },
    { key: "fitB", niches: ["fitness", "food"], platforms: ["YOUTUBE", "INSTAGRAM"], followers: 120_000, er: 0.02, location: "Delhi, IN", trust: 90 },
    { key: "tech", niches: ["tech"], platforms: ["YOUTUBE"], followers: 8_000, er: 0.08, location: "Bengaluru, IN", available: false },
    { key: "food", niches: ["food"], platforms: ["TIKTOK"], followers: 300_000, er: null, location: "mumbai", verified: true },
    { key: "susp", niches: ["fitness"], platforms: ["INSTAGRAM"], followers: 999_999, er: 0.1, location: "Mumbai", suspended: true },
    { key: "gone", niches: ["fitness"], platforms: ["INSTAGRAM"], followers: 999_998, er: 0.1, location: "Mumbai", deleted: true },
  ]
  for (const s of seeds) {
    const u = await user("CREATOR", { status: s.suspended ? "SUSPENDED" : "ACTIVE" })
    if (s.key === "fitA") creatorToken = signAccessToken({ id: u.id, email: u.email, role: "CREATOR" })
    const c = await prisma.creatorProfile.create({
      data: {
        userId: u.id,
        handle: `${tag}_${s.key}`.toLowerCase(),
        headline: `${tag} creator ${s.key}`,
        niches: s.niches,
        followersTotal: s.followers,
        engagementRate: s.er,
        location: s.location,
        verifiedAt: s.verified ? new Date() : null,
        available: s.available ?? true,
        deletedAt: s.deleted ? new Date() : null,
        socialAccounts: { create: s.platforms.map((platform) => ({ platform, source: "SELF_REPORTED" as const, status: "CONNECTED" as const, handle: s.key, followers: s.followers })) },
        ...(s.trust !== undefined && { score: { create: { trustScore: s.trust, nicheAuthority: 50, reliabilityScore: 50, modelVersion: "t" } } }),
      },
    })
    ids[s.key] = c.id
  }

  const brand = await prisma.brandProfile.create({ data: { userId: brandUser.id, slug: `${tag}-brand`, companyName: `${tag} Brand`, verifiedAt: new Date() } })
  const brief = (title: string, extra: Record<string, unknown>) =>
    prisma.brief.create({ data: { brandId: brand.id, title: `${tag} ${title}`, description: "desc", budgetPerCreator: 10_000, ...extra } })
  ids.briefPub = (await brief("published", { status: "PUBLISHED", niche: "Fitness", platforms: ["INSTAGRAM"], budgetPerCreator: 25_000, publishedAt: new Date(), deadline: new Date(Date.now() + 5 * 86400000) })).id
  ids.briefPub2 = (await brief("published cheap", { status: "PUBLISHED", niche: "food", platforms: ["YOUTUBE"], budgetPerCreator: 5_000, publishedAt: new Date(Date.now() - 86400000), deadline: new Date(Date.now() + 2 * 86400000) })).id
  ids.briefDraft = (await brief("draft", { status: "DRAFT", niche: "fitness" })).id
  ids.briefClosed = (await brief("closed", { status: "CLOSED", niche: "fitness" })).id
  ids.briefDirect = (await brief("direct", { status: "PUBLISHED", visibility: "DIRECT", niche: "fitness", publishedAt: new Date() })).id
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  await app.close()
  await prisma.$disconnect()
})

const search = async (qs: string, token = brandToken) => {
  const res = await app.inject({ method: "GET", url: `/search/creators?q=${tag}&pageSize=50&${qs}`, headers: { authorization: `Bearer ${token}` } })
  return res
}
const keysOf = (res: { json: () => { data: { id: string }[] } }) => {
  const byId = Object.fromEntries(Object.entries(ids).map(([k, v]) => [v, k]))
  return res.json().data.map((c) => byId[c.id])
}

describe("creator search access", () => {
  it("requires BRAND or ADMIN", async () => {
    expect((await app.inject({ method: "GET", url: "/search/creators" })).statusCode).toBe(401)
    expect((await search("", creatorToken)).statusCode).toBe(403)
    expect((await search("", adminToken)).statusCode).toBe(200)
    const res = await search("")
    expect(res.statusCode).toBe(200)
    expect(res.json().meta).toMatchObject({ engine: "postgres", page: 1, pageSize: 50, total: 4 })
  })
})

describe("postgres engine filters", () => {
  it("excludes suspended and soft-deleted creators", async () => {
    expect(keysOf(await search("")).sort()).toEqual(["fitA", "fitB", "food", "tech"])
  })

  it("filters by niche, platform, followers, engagement, location, verified and availability", async () => {
    expect(keysOf(await search("niche=fitness")).sort()).toEqual(["fitA", "fitB"])
    expect(keysOf(await search("niche=tech,food")).sort()).toEqual(["fitB", "food", "tech"])
    expect(keysOf(await search("platform=YOUTUBE")).sort()).toEqual(["fitB", "tech"])
    expect(keysOf(await search("minFollowers=10000&maxFollowers=150000")).sort()).toEqual(["fitA", "fitB"])
    expect(keysOf(await search("minEngagement=5")).sort()).toEqual(["fitA", "tech"])
    expect(keysOf(await search("location=MUMBAI")).sort()).toEqual(["fitA", "food"])
    expect(keysOf(await search("verified=true")).sort()).toEqual(["fitA", "food"])
    expect(keysOf(await search("verified=false")).sort()).toEqual(["fitB", "tech"])
    expect(keysOf(await search("available=false"))).toEqual(["tech"])
    expect((await search("minFollowers=10&maxFollowers=1")).statusCode).toBe(422)
    expect((await search("sort=random")).statusCode).toBe(422)
  })

  it("matches text on handle/name/headline case-insensitively", async () => {
    const res = await app.inject({ method: "GET", url: `/search/creators?q=${tag.toUpperCase()}_FITB`, headers: { authorization: `Bearer ${brandToken}` } })
    expect(keysOf(res)).toEqual(["fitB"])
  })

  it("sorts by followers, engagement, trust and relevance", async () => {
    expect(keysOf(await search("sort=followers"))).toEqual(["food", "fitB", "fitA", "tech"])
    expect(keysOf(await search("sort=engagement"))).toEqual(["tech", "fitA", "fitB", "food"])
    // Scored creators first by trust, then unscored by followers.
    expect(keysOf(await search("sort=relevance"))).toEqual(["fitB", "fitA", "food", "tech"])
    expect(keysOf(await search("sort=trust"))).toEqual(["fitB", "fitA", "food", "tech"])
  })

  it("paginates across the scored/unscored boundary", async () => {
    const pages: string[] = []
    for (const page of [1, 2, 3]) {
      const res = await app.inject({ method: "GET", url: `/search/creators?q=${tag}&pageSize=3&page=${page}`, headers: { authorization: `Bearer ${brandToken}` } })
      pages.push(...keysOf(res))
      expect(res.json().meta).toMatchObject({ total: 4, totalPages: 2 })
    }
    expect(pages).toEqual(["fitB", "fitA", "food", "tech"])
  })

  it("returns the public result shape", async () => {
    const item = (await search("niche=fitness&sort=trust")).json().data[0]
    expect(item).toMatchObject({ id: ids.fitB, name: `${tag} CREATOR`, platforms: ["INSTAGRAM", "YOUTUBE"], followers: 120000, trustScore: 90, verified: false, available: true })
  })
})

describe("brief search", () => {
  const briefs = (qs: string, token = creatorToken) =>
    app.inject({ method: "GET", url: `/search/briefs?q=${tag}&${qs}`, headers: { authorization: `Bearer ${token}` } })
  const briefKeys = (res: { json: () => { data: { id: string }[] } }) => {
    const byId = Object.fromEntries(Object.entries(ids).map(([k, v]) => [v, k]))
    return res.json().data.map((b) => byId[b.id])
  }

  it("needs authentication and returns published open briefs only", async () => {
    expect((await app.inject({ method: "GET", url: "/search/briefs" })).statusCode).toBe(401)
    const res = await briefs("")
    expect(res.statusCode).toBe(200)
    expect(briefKeys(res)).toEqual(["briefPub", "briefPub2"])
    expect(res.json().meta.engine).toBe("postgres")
    expect(res.json().data[0]).toMatchObject({ status: "PUBLISHED", brand: { name: `${tag} Brand`, verified: true } })
  })

  it("filters and sorts", async () => {
    expect(briefKeys(await briefs("niche=FITNESS"))).toEqual(["briefPub"])
    expect(briefKeys(await briefs("platform=YOUTUBE"))).toEqual(["briefPub2"])
    expect(briefKeys(await briefs("minBudget=10000"))).toEqual(["briefPub"])
    expect(briefKeys(await briefs("sort=budget"))).toEqual(["briefPub", "briefPub2"])
    expect(briefKeys(await briefs("sort=deadline"))).toEqual(["briefPub2", "briefPub"])
  })
})

describe("engine selection, reindex and indexer", () => {
  it("uses postgres without ELASTICSEARCH_URL and skips reindex", async () => {
    expect(selectEngine().name).toBe("postgres")
    expect((await app.inject({ method: "POST", url: "/internal/search/reindex" })).statusCode).toBe(403)
    const res = await app.inject({ method: "POST", url: "/internal/search/reindex", headers: { "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN! } })
    expect(res.json().data).toEqual({ engine: "postgres", creators: 0, briefs: 0, skipped: true })
  })

  it("builds equivalent Elasticsearch queries", () => {
    const q = buildCreatorQuery(searchCreatorsQuery.parse({ q: "yoga", niche: "fitness,food", platform: "INSTAGRAM", minFollowers: "1000", minEngagement: "3", verified: "true", sort: "trust", page: "2", pageSize: "10" }))
    expect(q.from).toBe(10)
    expect(JSON.stringify(q.query)).toContain('"niches":["fitness","food"]')
    expect(JSON.stringify(q.query)).toContain('"engagementRate":{"gte":0.03}')
    expect(q.sort).toEqual([{ trustScore: { order: "desc", missing: "_last" } }, { followers: "desc" }, { id: "asc" }])
    const b = buildBriefQuery(searchBriefsQuery.parse({ minBudget: "500", sort: "budget" }))
    expect(JSON.stringify(b.query)).toContain('"status":"PUBLISHED"')
  })

  it("routes events to the right document", async () => {
    const calls: string[] = []
    const fake = { ...postgresEngine, indexCreator: async (id: string) => void calls.push(`c:${id}`), indexBrief: async (id: string) => void calls.push(`b:${id}`) }
    const handle = createIndexHandler(fake)
    const ev = (topic: (typeof TOPICS)[keyof typeof TOPICS], payload: Record<string, unknown>, key = "k") => handle({ id: "1", topic, key, payload, createdAt: "" })
    await ev(TOPICS.CREATOR_METRICS_UPDATED, { creatorId: ids.fitA })
    await ev(TOPICS.BRIEF_PUBLISHED, { briefId: ids.briefPub })
    await ev(TOPICS.BRIEF_UPDATED, {}, ids.briefPub2)
    expect(calls).toEqual([`c:${ids.fitA}`, `b:${ids.briefPub}`, `b:${ids.briefPub2}`])
  })
})
