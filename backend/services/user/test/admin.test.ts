import "./setup-env"
import type { FastifyInstance } from "fastify"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@hustl/db"
import { buildApp } from "../src/app"
import { bearer, cleanup, createUserDirect, internalHeaders, PASSWORD, registerBrand, registerCreator } from "./helpers"

let app: FastifyInstance
let adminToken: string
let adminId: string

beforeAll(async () => {
  app = await buildApp()
  const admin = await createUserDirect("ADMIN")
  adminToken = admin.token
  adminId = admin.user.id
})

afterAll(async () => {
  await cleanup()
  await app.close()
})

describe("admin role-based access", () => {
  it.each([
    ["GET", "/admin/users"],
    ["GET", "/admin/verifications"],
  ] as const)("%s %s: 401 anonymous, 403 creator/brand, 200 admin", async (method, url) => {
    const creator = await registerCreator(app)
    const brand = await registerBrand(app)
    expect((await app.inject({ method, url })).statusCode).toBe(401)
    expect((await app.inject({ method, url, headers: bearer(creator.accessToken) })).statusCode).toBe(403)
    expect((await app.inject({ method, url, headers: bearer(brand.accessToken) })).statusCode).toBe(403)
    const res = await app.inject({ method, url, headers: bearer(adminToken) })
    expect(res.statusCode).toBe(200)
    expect(res.json().meta).toMatchObject({ page: 1, pageSize: 20 })
  })

  it("non-admins can't change user status or decide verifications", async () => {
    const creator = await registerCreator(app)
    const other = await registerBrand(app)
    const h = bearer(creator.accessToken)
    expect((await app.inject({ method: "PATCH", url: `/admin/users/${other.user.id}/status`, headers: h, payload: { status: "SUSPENDED" } })).statusCode).toBe(403)
    expect((await app.inject({ method: "POST", url: `/admin/verifications/${other.user.id}/decision`, headers: h, payload: { approve: true } })).statusCode).toBe(403)
  })

  it("searches users", async () => {
    const creator = await registerCreator(app)
    const res = await app.inject({ method: "GET", url: `/admin/users?q=${encodeURIComponent(creator.user.email)}`, headers: bearer(adminToken) })
    expect(res.json().data).toEqual([expect.objectContaining({ id: creator.user.id, role: "CREATOR" })])
  })
})

describe("suspension", () => {
  it("hides suspended creators and brands from public profiles and blocks login until reactivated", async () => {
    const creator = await registerCreator(app)
    const brand = await registerBrand(app)
    const { handle } = await prisma.creatorProfile.findUniqueOrThrow({ where: { userId: creator.user.id } })
    const { slug } = await prisma.brandProfile.findUniqueOrThrow({ where: { userId: brand.user.id } })
    expect((await app.inject({ method: "GET", url: `/creators/${handle}` })).statusCode).toBe(200)

    for (const id of [creator.user.id, brand.user.id]) {
      const res = await app.inject({ method: "PATCH", url: `/admin/users/${id}/status`, headers: bearer(adminToken), payload: { status: "SUSPENDED", reason: "test" } })
      expect(res.statusCode).toBe(200)
      expect(res.json().data.status).toBe("SUSPENDED")
    }

    expect((await app.inject({ method: "GET", url: `/creators/${handle}` })).statusCode).toBe(404)
    expect((await app.inject({ method: "GET", url: `/brands/${slug}` })).statusCode).toBe(404)
    expect((await app.inject({ method: "POST", url: "/auth/login", payload: { email: creator.user.email, password: PASSWORD } })).statusCode).toBe(403)
    expect((await app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken: creator.refreshToken } })).statusCode).toBe(401)
    expect((await app.inject({ method: "GET", url: "/users/me", headers: bearer(creator.accessToken) })).statusCode).toBe(403)

    await app.inject({ method: "PATCH", url: `/admin/users/${creator.user.id}/status`, headers: bearer(adminToken), payload: { status: "ACTIVE" } })
    expect((await app.inject({ method: "GET", url: `/creators/${handle}` })).statusCode).toBe(200)
  })

  it("admins can't change their own status", async () => {
    const res = await app.inject({ method: "PATCH", url: `/admin/users/${adminId}/status`, headers: bearer(adminToken), payload: { status: "SUSPENDED" } })
    expect(res.statusCode).toBe(400)
  })
})

describe("verification", () => {
  it("creator submits, admin approves: verifiedAt, kycStatus and user.kyc_verified", async () => {
    const creator = await registerCreator(app)
    const h = bearer(creator.accessToken)

    const wrongType = await app.inject({ method: "POST", url: "/verifications", headers: h, payload: { type: "BRAND_BUSINESS", details: {} } })
    expect(wrongType.statusCode).toBe(422)

    const foreignDoc = await app.inject({
      method: "POST",
      url: "/verifications",
      headers: h,
      payload: { type: "CREATOR_IDENTITY", details: { legalName: "Test" }, documentIds: ["00000000-0000-4000-8000-000000000000"] },
    })
    expect(foreignDoc.statusCode).toBe(422)

    const submit = await app.inject({ method: "POST", url: "/verifications", headers: h, payload: { type: "CREATOR_IDENTITY", details: { legalName: "Test Creator" } } })
    expect(submit.statusCode, submit.body).toBe(201)
    const request = submit.json().data
    expect(request.status).toBe("PENDING")
    expect((await prisma.user.findUniqueOrThrow({ where: { id: creator.user.id } })).kycStatus).toBe("PENDING")

    expect((await app.inject({ method: "POST", url: "/verifications", headers: h, payload: { type: "CREATOR_IDENTITY", details: {} } })).statusCode).toBe(409)
    expect((await app.inject({ method: "GET", url: "/verifications/me", headers: h })).json().data).toHaveLength(1)

    const queue = await app.inject({ method: "GET", url: "/admin/verifications?pageSize=100", headers: bearer(adminToken) })
    expect(queue.json().data.some((v: { id: string }) => v.id === request.id)).toBe(true)

    const decide = await app.inject({ method: "POST", url: `/admin/verifications/${request.id}/decision`, headers: bearer(adminToken), payload: { approve: true, note: "Looks good" } })
    expect(decide.statusCode, decide.body).toBe(200)
    expect(decide.json().data).toMatchObject({ status: "APPROVED", reviewerNote: "Looks good" })

    const user = await prisma.user.findUniqueOrThrow({ where: { id: creator.user.id }, include: { creator: true } })
    expect(user.kycStatus).toBe("VERIFIED")
    expect(user.creator?.verifiedAt).not.toBeNull()
    const event = await prisma.outboxEvent.findFirst({ where: { topic: "user.kyc_verified", key: creator.user.id } })
    expect(event?.payload).toMatchObject({ verificationId: request.id, creatorId: user.creator!.id })

    const again = await app.inject({ method: "POST", url: `/admin/verifications/${request.id}/decision`, headers: bearer(adminToken), payload: { approve: false } })
    expect(again.statusCode).toBe(409)
  })

  it("rejection sets kycStatus REJECTED without verifying the profile", async () => {
    const brand = await registerBrand(app)
    const submit = await app.inject({ method: "POST", url: "/verifications", headers: bearer(brand.accessToken), payload: { type: "BRAND_BUSINESS", details: { gstin: "27AAPFU0939F1ZV" } } })
    const decide = await app.inject({ method: "POST", url: `/admin/verifications/${submit.json().data.id}/decision`, headers: bearer(adminToken), payload: { approve: false, note: "Mismatch" } })
    expect(decide.statusCode).toBe(200)
    const user = await prisma.user.findUniqueOrThrow({ where: { id: brand.user.id }, include: { brand: true } })
    expect(user.kycStatus).toBe("REJECTED")
    expect(user.brand?.verifiedAt).toBeNull()
  })
})

describe("internal endpoints", () => {
  it("require the internal service token", async () => {
    const creator = await registerCreator(app)
    expect((await app.inject({ method: "GET", url: `/internal/users/${creator.user.id}` })).statusCode).toBe(403)
    expect((await app.inject({ method: "GET", url: `/internal/users/${creator.user.id}`, headers: bearer(adminToken) })).statusCode).toBe(403)

    const res = await app.inject({ method: "GET", url: `/internal/users/${creator.user.id}`, headers: internalHeaders() })
    expect(res.statusCode).toBe(200)
    const creatorId = res.json().data.creatorId
    expect(creatorId).toBeTruthy()

    const byUser = await app.inject({ method: "GET", url: `/internal/creators/by-user/${creator.user.id}`, headers: internalHeaders() })
    expect(byUser.json().data).toMatchObject({ id: creatorId, user: { id: creator.user.id, email: creator.user.email } })
    expect((await app.inject({ method: "GET", url: `/internal/creators/${creatorId}`, headers: internalHeaders() })).statusCode).toBe(200)

    const batch = await app.inject({ method: "POST", url: "/internal/users/batch", headers: internalHeaders(), payload: { ids: [creator.user.id, adminId] } })
    expect(batch.json().data.map((u: { id: string }) => u.id).sort()).toEqual([creator.user.id, adminId].sort())

    const brand = await registerBrand(app)
    const brandByUser = await app.inject({ method: "GET", url: `/internal/brands/by-user/${brand.user.id}`, headers: internalHeaders() })
    expect(brandByUser.statusCode).toBe(200)
    expect((await app.inject({ method: "GET", url: `/internal/brands/${brandByUser.json().data.id}`, headers: internalHeaders() })).statusCode).toBe(200)
  })
})
