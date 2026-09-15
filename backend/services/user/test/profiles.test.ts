import "./setup-env"
import type { FastifyInstance } from "fastify"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@hustl/db"
import { verifyAccessToken } from "@hustl/common"
import { buildApp } from "../src/app"
import { bearer, cleanup, createUserDirect, registerBrand, registerCreator, uid } from "./helpers"

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp()
})

afterAll(async () => {
  await cleanup()
  await app.close()
})

const completeCreatorProfile = {
  headline: "Tech reviewer",
  bio: "I review phones and laptops.",
  location: "Bengaluru",
  niches: ["tech", "gaming"],
  rateCard: [{ deliverable: "Instagram Reel", price: 25000 }],
  portfolio: [{ title: "Pixel review", url: "https://youtube.com/watch?v=abc" }],
  avatarUrl: "https://cdn.example.com/avatar.png",
}

describe("GET /users/me", () => {
  it("requires authentication", async () => {
    expect((await app.inject({ method: "GET", url: "/users/me" })).statusCode).toBe(401)
    expect((await app.inject({ method: "GET", url: "/users/me", headers: bearer("garbage.token.value") })).statusCode).toBe(401)
  })

  it("computes creator profile completion from real fields, including social accounts", async () => {
    const s = await registerCreator(app)
    const me = await app.inject({ method: "GET", url: "/users/me", headers: bearer(s.accessToken) })
    expect(me.statusCode).toBe(200)
    expect(me.json().data.profileCompletion).toEqual({
      percent: 0,
      missing: ["headline", "bio", "location", "niches", "rateCard", "portfolio", "avatar", "socialAccount"],
    })
    expect(me.json().data.brand).toBeNull()

    const put = await app.inject({ method: "PUT", url: "/creators/me", headers: bearer(s.accessToken), payload: completeCreatorProfile })
    expect(put.statusCode, put.body).toBe(200)

    const after = await app.inject({ method: "GET", url: "/users/me", headers: bearer(s.accessToken) })
    expect(after.json().data.profileCompletion).toEqual({ percent: 88, missing: ["socialAccount"] })

    const creatorId = after.json().data.creator.id
    await prisma.socialAccount.create({ data: { creatorId, platform: "INSTAGRAM", source: "SELF_REPORTED", status: "CONNECTED", handle: "tech_reviewer" } })
    const full = await app.inject({ method: "GET", url: "/users/me", headers: bearer(s.accessToken) })
    expect(full.json().data.profileCompletion).toEqual({ percent: 100, missing: [] })
  })

  it("PATCH updates name and image", async () => {
    const s = await registerBrand(app)
    const res = await app.inject({ method: "PATCH", url: "/users/me", headers: bearer(s.accessToken), payload: { name: "Renamed", image: "https://cdn.example.com/me.png" } })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({ name: "Renamed", image: "https://cdn.example.com/me.png" })
    expect((await app.inject({ method: "PATCH", url: "/users/me", headers: bearer(s.accessToken), payload: { email: "x@y.z" } })).statusCode).toBe(422)
  })
})

describe("PUT /creators/me", () => {
  it.each([
    ["unknown niche", { niches: ["astrology"] }],
    ["non-positive price", { rateCard: [{ deliverable: "Reel", price: 0 }] }],
    ["negative price", { rateCard: [{ deliverable: "Reel", price: -500 }] }],
    ["non-http portfolio url", { portfolio: [{ title: "x", url: "javascript:alert(1)" }] }],
    ["invalid handle", { handle: "Not A Handle!" }],
    ["unknown field", { followersTotal: 1_000_000 }],
  ])("rejects %s with 422", async (_label, payload) => {
    const s = await registerCreator(app)
    const res = await app.inject({ method: "PUT", url: "/creators/me", headers: bearer(s.accessToken), payload })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe("VALIDATION_ERROR")
  })

  it("updates the profile and emits creator.profile_updated", async () => {
    const s = await registerCreator(app)
    const newHandle = `new_${uid()}`
    const res = await app.inject({ method: "PUT", url: "/creators/me", headers: bearer(s.accessToken), payload: { ...completeCreatorProfile, handle: newHandle } })
    expect(res.statusCode).toBe(200)
    const profile = res.json().data
    expect(profile).toMatchObject({ handle: newHandle, niches: ["tech", "gaming"], rateCard: completeCreatorProfile.rateCard })
    const event = await prisma.outboxEvent.findFirst({ where: { topic: "creator.profile_updated", key: profile.id }, orderBy: { id: "desc" } })
    expect(event?.payload).toMatchObject({ creatorId: profile.id, userId: s.user.id, handle: newHandle })

    const own = await app.inject({ method: "GET", url: "/creators/me", headers: bearer(s.accessToken) })
    expect(own.json().data.handle).toBe(newHandle)
  })

  it("rejects a handle owned by someone else with 409", async () => {
    const a = await registerCreator(app)
    const b = await registerCreator(app)
    const aHandle = (await prisma.creatorProfile.findUniqueOrThrow({ where: { userId: a.user.id } })).handle
    const res = await app.inject({ method: "PUT", url: "/creators/me", headers: bearer(b.accessToken), payload: { handle: aHandle } })
    expect(res.statusCode).toBe(409)
  })

  it("is creator-only", async () => {
    const brand = await registerBrand(app)
    expect((await app.inject({ method: "PUT", url: "/creators/me", headers: bearer(brand.accessToken), payload: { bio: "x" } })).statusCode).toBe(403)
    expect((await app.inject({ method: "GET", url: "/creators/me", headers: bearer(brand.accessToken) })).statusCode).toBe(403)
  })
})

describe("brand profile", () => {
  it("validates, updates, emits brand.profile_updated and reports completion", async () => {
    const s = await registerBrand(app)
    expect((await app.inject({ method: "PUT", url: "/brands/me", headers: bearer(s.accessToken), payload: { website: "not a url" } })).statusCode).toBe(422)
    expect((await app.inject({ method: "PUT", url: "/brands/me", headers: bearer(s.accessToken), payload: { gstin: "123" } })).statusCode).toBe(422)

    const res = await app.inject({
      method: "PUT",
      url: "/brands/me",
      headers: bearer(s.accessToken),
      payload: { website: "https://acme.example.com", industry: "Beauty", description: "Clean skincare", location: "Mumbai", gstin: "27aapfu0939f1zv" },
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json().data.gstin).toBe("27AAPFU0939F1ZV")
    const event = await prisma.outboxEvent.findFirst({ where: { topic: "brand.profile_updated", key: res.json().data.id } })
    expect(event).not.toBeNull()

    const me = await app.inject({ method: "GET", url: "/users/me", headers: bearer(s.accessToken) })
    expect(me.json().data.profileCompletion).toEqual({ percent: 83, missing: ["logo"] })
  })

  it("public brand profile shows open briefs and deal counts", async () => {
    const s = await registerBrand(app)
    const brand = await prisma.brandProfile.findUniqueOrThrow({ where: { userId: s.user.id } })
    const res = await app.inject({ method: "GET", url: `/brands/${brand.slug}` })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({ slug: brand.slug, openBriefs: 0, completedDeals: 0, reviewStats: { count: 0, avgRating: null }, reviews: [] })
    expect(res.json().data.gstin).toBeUndefined()
  })
})

describe("public creator profile", () => {
  it("returns scores and social summaries without audience PII", async () => {
    const s = await registerCreator(app)
    const creator = await prisma.creatorProfile.findUniqueOrThrow({ where: { userId: s.user.id } })
    await prisma.socialAccount.create({
      data: {
        creatorId: creator.id,
        platform: "YOUTUBE",
        source: "PHYLLO",
        status: "CONNECTED",
        handle: "yt_handle",
        externalAccountId: "phyllo-secret-id",
        followers: 120_000,
        engagementRate: 0.041,
        audienceDemographics: { cities: [{ name: "Pune", share: 0.2 }] },
        lastSyncedAt: new Date(),
      },
    })
    await prisma.creatorScore.create({ data: { creatorId: creator.id, trustScore: 81, nicheAuthority: 70, reliabilityScore: 90, modelVersion: "test-v1" } })

    const res = await app.inject({ method: "GET", url: `/creators/${creator.handle}` })
    expect(res.statusCode).toBe(200)
    const body = res.json().data
    expect(body.scores).toMatchObject({ trustScore: 81, reliabilityScore: 90 })
    expect(body.socialAccounts).toEqual([
      expect.objectContaining({ platform: "YOUTUBE", handle: "yt_handle", followers: 120_000, engagementRate: 0.041, source: "PHYLLO" }),
    ])
    expect(res.body).not.toContain("audienceDemographics")
    expect(res.body).not.toContain("phyllo-secret-id")
    expect(res.body).not.toContain(s.user.email)
    expect(body.savedByViewer).toBeNull()
  })

  it("returns 404 for unknown handles and soft-deleted users", async () => {
    expect((await app.inject({ method: "GET", url: `/creators/nobody_${uid()}` })).statusCode).toBe(404)
    const s = await registerCreator(app)
    const creator = await prisma.creatorProfile.findUniqueOrThrow({ where: { userId: s.user.id } })
    await prisma.user.update({ where: { id: s.user.id }, data: { deletedAt: new Date() } })
    expect((await app.inject({ method: "GET", url: `/creators/${creator.handle}` })).statusCode).toBe(404)
  })
})

describe("saved creators", () => {
  it("lets a brand save, list and unsave creators", async () => {
    const brand = await registerBrand(app)
    const creatorSession = await registerCreator(app)
    const creator = await prisma.creatorProfile.findUniqueOrThrow({ where: { userId: creatorSession.user.id } })
    const h = bearer(brand.accessToken)

    const save = await app.inject({ method: "PUT", url: `/brands/me/saved-creators/${creator.id}`, headers: h })
    expect(save.statusCode).toBe(200)
    expect(save.json().data).toEqual({ creatorId: creator.id, saved: true })
    // Idempotent.
    expect((await app.inject({ method: "PUT", url: `/brands/me/saved-creators/${creator.id}`, headers: h })).statusCode).toBe(200)

    const list = await app.inject({ method: "GET", url: "/brands/me/saved-creators", headers: h })
    expect(list.json().data).toHaveLength(1)
    expect(list.json().data[0].creator).toMatchObject({ id: creator.id, handle: creator.handle })
    expect(list.json().meta).toMatchObject({ total: 1, page: 1 })

    const pub = await app.inject({ method: "GET", url: `/creators/${creator.handle}`, headers: h })
    expect(pub.json().data.savedByViewer).toBe(true)

    const del = await app.inject({ method: "DELETE", url: `/brands/me/saved-creators/${creator.id}`, headers: h })
    expect(del.json().data).toEqual({ creatorId: creator.id, saved: false })
    expect((await app.inject({ method: "GET", url: "/brands/me/saved-creators", headers: h })).json().data).toHaveLength(0)

    expect((await app.inject({ method: "PUT", url: `/brands/me/saved-creators/${creator.id}`, headers: bearer(creatorSession.accessToken) })).statusCode).toBe(403)
    expect((await app.inject({ method: "PUT", url: `/brands/me/saved-creators/not-a-uuid`, headers: h })).statusCode).toBe(422)
  })
})

describe("POST /users/me/role", () => {
  it("assigns a role once and returns an access token carrying it", async () => {
    const { user, token } = await createUserDirect(null)
    const res = await app.inject({ method: "POST", url: "/users/me/role", headers: bearer(token), payload: { role: "BRAND", companyName: `Role Co ${uid()}` } })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json().data.user.role).toBe("BRAND")
    expect(verifyAccessToken(res.json().data.accessToken).role).toBe("BRAND")
    expect(await prisma.brandProfile.findUnique({ where: { userId: user.id } })).not.toBeNull()

    const again = await app.inject({ method: "POST", url: "/users/me/role", headers: bearer(token), payload: { role: "CREATOR" } })
    expect(again.statusCode).toBe(409)
  })
})
