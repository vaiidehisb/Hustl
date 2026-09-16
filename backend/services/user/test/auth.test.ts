import "./setup-env"
import { createHash } from "node:crypto"
import type { FastifyInstance } from "fastify"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@hustl/db"
import { brandSlugBase } from "../src/lib/slug"
import { buildApp } from "../src/app"
import { cleanup, PASSWORD, registerBrand, registerCreator, testEmail, uid } from "./helpers"

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp()
})

afterAll(async () => {
  await cleanup()
  await app.close()
})

const post = (url: string, payload: unknown, headers: Record<string, string> = {}) => app.inject({ method: "POST", url, payload: payload as object, headers })

describe("POST /auth/register", () => {
  it("creates a creator with a profile, hashed refresh token and user.created event", async () => {
    const handle = `reg_${uid()}`
    const rawEmail = `  Creator.${uid()}@Test.Hustl.DEV `
    const session = await registerCreator(app, { email: rawEmail, handle })

    expect(session.user.email).toBe(rawEmail.trim().toLowerCase())
    expect(session.user.role).toBe("CREATOR")
    expect(session.accessToken).toBeTruthy()
    expect(session.refreshToken.length).toBeGreaterThanOrEqual(64)
    expect(JSON.stringify(session)).not.toContain("passwordHash")

    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, include: { creator: true, refreshTokens: true } })
    expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/)
    expect(user.creator?.handle).toBe(handle)
    expect(user.refreshTokens).toHaveLength(1)
    const [token] = user.refreshTokens
    expect(token!.tokenHash).toBe(createHash("sha256").update(session.refreshToken).digest("hex"))
    const ttlDays = (token!.expiresAt.getTime() - Date.now()) / 86_400_000
    expect(ttlDays).toBeGreaterThan(29.9)
    expect(ttlDays).toBeLessThanOrEqual(30)

    const event = await prisma.outboxEvent.findFirst({ where: { topic: "user.created", key: session.user.id } })
    expect(event?.payload).toMatchObject({ userId: session.user.id, role: "CREATOR", creatorId: user.creator!.id })
  })

  it("derives a handle when a creator doesn't pick one", async () => {
    const session = await registerCreator(app, { handle: undefined, name: `Auto Handle ${uid()}` })
    const creator = await prisma.creatorProfile.findUniqueOrThrow({ where: { userId: session.user.id } })
    expect(creator.handle).toMatch(/^auto_handle_[a-z0-9]+(_\d+)?$/)
  })

  it("creates brands with unique slugs, suffixing on collision", async () => {
    const companyName = `Slug Test ${uid()}`
    const first = await registerBrand(app, { companyName })
    const second = await registerBrand(app, { companyName })
    const [b1, b2] = await Promise.all([
      prisma.brandProfile.findUniqueOrThrow({ where: { userId: first.user.id } }),
      prisma.brandProfile.findUniqueOrThrow({ where: { userId: second.user.id } }),
    ])
    expect(b1.slug).toBe(brandSlugBase(companyName))
    expect(b2.slug).toBe(`${brandSlugBase(companyName)}-2`)
    expect(b2.companyName).toBe(companyName)
  })

  it("rejects a duplicate email (case-insensitively) with 409", async () => {
    const email = testEmail("dup")
    await registerCreator(app, { email })
    const res = await post("/auth/register", { email: email.toUpperCase(), password: PASSWORD, name: "Again", role: "BRAND", companyName: "Dup Co" })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ success: false, error: { code: "CONFLICT" } })
  })

  it("rejects a taken handle with 409", async () => {
    const handle = `taken_${uid()}`
    await registerCreator(app, { handle })
    const res = await post("/auth/register", { email: testEmail("dup"), password: PASSWORD, name: "Other", role: "CREATOR", handle })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.details).toEqual({ field: "handle" })
  })

  it.each([
    ["too short", "abc12"],
    ["no number", "onlyletters"],
    ["no letter", "1234567890"],
  ])("rejects a weak password (%s) with 422", async (_label, password) => {
    const email = testEmail("weak")
    const res = await post("/auth/register", { email, password, name: "Weak", role: "CREATOR" })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe("VALIDATION_ERROR")
    expect(res.json().error.details.fieldErrors.password).toBeDefined()
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull()
  })

  it("rejects admin self-registration and brands without a company", async () => {
    expect((await post("/auth/register", { email: testEmail("x"), password: PASSWORD, name: "X", role: "ADMIN" })).statusCode).toBe(422)
    expect((await post("/auth/register", { email: testEmail("x"), password: PASSWORD, name: "X", role: "BRAND" })).statusCode).toBe(422)
  })
})

describe("POST /auth/login", () => {
  it("returns the same generic 401 for a wrong password and an unknown email", async () => {
    const s = await registerCreator(app)
    const wrong = await post("/auth/login", { email: s.user.email, password: "Wrong-passw0rd" })
    const unknown = await post("/auth/login", { email: testEmail("nobody"), password: PASSWORD })
    expect(wrong.statusCode).toBe(401)
    expect(unknown.statusCode).toBe(401)
    expect(wrong.json().error).toEqual(unknown.json().error)
  })

  it("logs in with normalised email and updates lastLoginAt", async () => {
    const s = await registerBrand(app)
    await prisma.user.update({ where: { id: s.user.id }, data: { lastLoginAt: null } })
    const res = await post("/auth/login", { email: `  ${s.user.email.toUpperCase()}`, password: PASSWORD })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.user.id).toBe(s.user.id)
    const user = await prisma.user.findUniqueOrThrow({ where: { id: s.user.id } })
    expect(user.lastLoginAt).not.toBeNull()
  })

  it("returns 403 for a suspended account with the right password", async () => {
    const s = await registerCreator(app)
    await prisma.user.update({ where: { id: s.user.id }, data: { status: "SUSPENDED" } })
    const res = await post("/auth/login", { email: s.user.email, password: PASSWORD })
    expect(res.statusCode).toBe(403)
  })
})

describe("refresh tokens", () => {
  it("rotates on refresh and revokes the whole family when a used token is replayed", async () => {
    const s = await registerCreator(app)

    const first = await post("/auth/refresh", { refreshToken: s.refreshToken })
    expect(first.statusCode).toBe(200)
    const rotated = first.json().data
    expect(rotated.refreshToken).not.toBe(s.refreshToken)
    expect(rotated.accessToken).toBeTruthy()

    // A concurrent/duplicate refresh within the grace window is accepted (browser races).
    const racing = await post("/auth/refresh", { refreshToken: s.refreshToken })
    expect(racing.statusCode).toBe(200)

    // Outside the grace window, replaying the rotated token → reuse detected.
    await prisma.refreshToken.updateMany({
      where: { tokenHash: createHash("sha256").update(s.refreshToken).digest("hex") },
      data: { rotatedAt: new Date(Date.now() - 60_000) },
    })
    const replay = await post("/auth/refresh", { refreshToken: s.refreshToken })
    expect(replay.statusCode).toBe(401)

    // …which also kills the legitimate descendant token.
    const afterReuse = await post("/auth/refresh", { refreshToken: rotated.refreshToken })
    expect(afterReuse.statusCode).toBe(401)
    expect(await prisma.refreshToken.count({ where: { userId: s.user.id, revokedAt: null } })).toBe(0)
  })

  it("rejects unknown and expired tokens", async () => {
    expect((await post("/auth/refresh", { refreshToken: "x".repeat(64) })).statusCode).toBe(401)
    const s = await registerCreator(app)
    await prisma.refreshToken.updateMany({ where: { userId: s.user.id }, data: { expiresAt: new Date(Date.now() - 1000) } })
    expect((await post("/auth/refresh", { refreshToken: s.refreshToken })).statusCode).toBe(401)
  })

  it("lets two concurrent refreshes with the same token both succeed (rotation grace window)", async () => {
    const s = await registerCreator(app)
    const results = await Promise.all([post("/auth/refresh", { refreshToken: s.refreshToken }), post("/auth/refresh", { refreshToken: s.refreshToken })])
    expect(results.map((r) => r.statusCode)).toEqual([200, 200])
    // Each caller gets its own usable session; the presented token is rotated away.
    const tokens = results.map((r) => r.json().data.refreshToken)
    expect(new Set(tokens).size).toBe(2)
    expect(tokens).not.toContain(s.refreshToken)
    expect(await prisma.refreshToken.count({ where: { userId: s.user.id, revokedAt: null } })).toBe(2)
  })

  it("logout revokes the token", async () => {
    const s = await registerBrand(app)
    const out = await post("/auth/logout", { refreshToken: s.refreshToken })
    expect(out.statusCode).toBe(200)
    expect(out.json().data).toEqual({ loggedOut: true })
    const row = await prisma.refreshToken.findFirstOrThrow({ where: { userId: s.user.id } })
    expect(row.revokedAt).not.toBeNull()
  })
})

describe("POST /auth/google", () => {
  it("returns 503 INTEGRATION_UNAVAILABLE when GOOGLE_CLIENT_ID is not configured", async () => {
    const saved = process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_ID
    try {
      const res = await post("/auth/google", { idToken: "a".repeat(40) })
      expect(res.statusCode).toBe(503)
      expect(res.json().error).toMatchObject({ code: "INTEGRATION_UNAVAILABLE", details: { integration: "Google sign-in", missingEnv: ["GOOGLE_CLIENT_ID"] } })
    } finally {
      if (saved !== undefined) process.env.GOOGLE_CLIENT_ID = saved
    }
  })

  it("rejects an unverifiable Google token with 401 when configured", async () => {
    const saved = process.env.GOOGLE_CLIENT_ID
    process.env.GOOGLE_CLIENT_ID = "1234567890-test.apps.googleusercontent.com"
    try {
      const res = await post("/auth/google", { idToken: "not.a.valid-google-jwt-token-value" })
      expect(res.statusCode).toBe(401)
    } finally {
      if (saved === undefined) delete process.env.GOOGLE_CLIENT_ID
      else process.env.GOOGLE_CLIENT_ID = saved
    }
  })
})
