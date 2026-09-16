import "./setup"
import { randomUUID } from "node:crypto"
import type { FastifyInstance } from "fastify"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { signAccessToken } from "@hustl/common"
import { prisma } from "@hustl/db"
import { searchCreatorsQuery, type CreatorSearchResult } from "@hustl/contracts"
import { buildApp } from "../src/app"
import { badgeGroups, postgresEngine } from "../src/engines/postgres"
import { buildCreatorQuery } from "../src/engines/elastic"

let app: FastifyInstance
let brandToken = ""
const tag = `badge${randomUUID().slice(0, 8)}`
const userIds: string[] = []
const ids: Record<string, string> = {}

type Seed = { key: string; followers: number; badge?: "STANDARD" | "PRIORITY"; badgeUntil?: Date; available?: boolean }

const seeds: Seed[] = [
  // The unbadged creator has the biggest following, so any lift can only come from the badge.
  { key: "plain", followers: 900_000 },
  { key: "standard", followers: 10_000, badge: "STANDARD", badgeUntil: new Date(Date.now() + 200 * 86_400_000) },
  { key: "priority", followers: 5_000, badge: "PRIORITY", badgeUntil: new Date(Date.now() + 200 * 86_400_000) },
  // An expired badge is the same as no badge.
  { key: "lapsed", followers: 800_000, badge: "PRIORITY", badgeUntil: new Date(Date.now() - 86_400_000) },
  { key: "busy", followers: 700_000, badge: "PRIORITY", badgeUntil: new Date(Date.now() + 200 * 86_400_000), available: false },
]

beforeAll(async () => {
  app = await buildApp(postgresEngine)
  const brandUser = await prisma.user.create({ data: { email: `${tag}-brand@test.hustl.local`, name: `${tag} brand`, role: "BRAND" } })
  userIds.push(brandUser.id)
  brandToken = signAccessToken({ id: brandUser.id, email: brandUser.email, role: "BRAND" })

  for (const s of seeds) {
    const u = await prisma.user.create({ data: { email: `${tag}-${s.key}@test.hustl.local`, name: `${tag} ${s.key}`, role: "CREATOR" } })
    userIds.push(u.id)
    const c = await prisma.creatorProfile.create({
      data: {
        userId: u.id,
        handle: `${tag}_${s.key}`.toLowerCase(),
        headline: `${tag} creator`,
        niches: ["tech"],
        followersTotal: s.followers,
        available: s.available ?? true,
        badgeTier: s.badge ?? null,
        badgeUntil: s.badgeUntil ?? null,
      },
    })
    ids[s.key] = c.id
  }
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  await app.close()
  await prisma.$disconnect()
})

const search = async (qs = "") => {
  const size = qs.includes("pageSize") ? "" : "pageSize=50&"
  const res = await app.inject({ method: "GET", url: `/search/creators?q=${tag}&${size}${qs}`, headers: { authorization: `Bearer ${brandToken}` } })
  expect(res.statusCode).toBe(200)
  return res.json().data as CreatorSearchResult[]
}
const keys = (items: CreatorSearchResult[]) => {
  const byId = Object.fromEntries(Object.entries(ids).map(([k, v]) => [v, k]))
  return items.map((c) => byId[c.id]).filter(Boolean)
}

describe("paid badge placement (postgres engine)", () => {
  it("ranks priority above standard above unbadged in the default relevance sort", async () => {
    // `plain` has by far the most followers and still comes after both badge groups;
    // inside a group the usual ordering applies (busy 700k before priority 5k).
    expect(keys(await search())).toEqual(["busy", "priority", "standard", "plain", "lapsed"])
  })

  it("exposes badgeTier on the DTO, and only while it is in date", async () => {
    const items = await search()
    const byKey = Object.fromEntries(keys(items).map((k, i) => [k, items[i]]))
    expect(byKey.priority.badgeTier).toBe("PRIORITY")
    expect(byKey.standard.badgeTier).toBe("STANDARD")
    expect(byKey.lapsed.badgeTier).toBeNull()
    // The paid badge never implies KYC verification.
    expect(byKey.priority.verified).toBe(false)
  })

  it("never lets paid placement override a hard filter", async () => {
    // `busy` has a priority badge but is unavailable, so the filter still excludes it.
    expect(keys(await search("available=true"))).not.toContain("busy")
    // Filtered down to the big accounts, the badged one still leads its own result set.
    expect(keys(await search("minFollowers=600000"))).toEqual(["busy", "plain", "lapsed"])
    expect(keys(await search("available=true"))).toEqual(["priority", "standard", "plain", "lapsed"])
    // Badged creators are still subject to the niche filter.
    expect(keys(await search("niche=fashion"))).toEqual([])
  })

  it("leaves explicitly chosen sorts alone", async () => {
    // A brand that asked for "most followers" gets exactly that.
    expect(keys(await search("sort=followers"))).toEqual(["plain", "lapsed", "busy", "standard", "priority"])
  })

  it("pages the badge groups without dropping or repeating anyone", async () => {
    const firstPage = keys(await search("pageSize=2&page=1"))
    const secondPage = keys(await search("pageSize=2&page=2"))
    const thirdPage = keys(await search("pageSize=2&page=3"))
    expect([...firstPage, ...secondPage, ...thirdPage]).toEqual(["busy", "priority", "standard", "plain", "lapsed"])
  })

  it("groups are disjoint and cover everyone", async () => {
    const counts = await Promise.all(badgeGroups().map((g) => prisma.creatorProfile.count({ where: { AND: [{ handle: { startsWith: tag.toLowerCase() } }, g] } })))
    expect(counts).toEqual([2, 1, 2])
  })
})

describe("paid badge placement (elasticsearch query)", () => {
  it("sorts on badgeRank first for relevance and not at all for other sorts", () => {
    const relevance = buildCreatorQuery(searchCreatorsQuery.parse({}))
    expect((relevance.sort as unknown[])[0]).toEqual({ badgeRank: { order: "desc", missing: "_last" } })
    const byFollowers = buildCreatorQuery(searchCreatorsQuery.parse({ sort: "followers" }))
    expect(JSON.stringify(byFollowers.sort)).not.toContain("badgeRank")
  })
})
