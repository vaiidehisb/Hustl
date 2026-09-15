import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import Fastify, { type FastifyInstance } from "fastify"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

const envFile = fileURLToPath(new URL("../../../.env", import.meta.url))
if (existsSync(envFile)) process.loadEnvFile(envFile)
process.env.JWT_SECRET ??= "gateway-test-secret-that-is-long-enough-000000"

const { signAccessToken } = await import("@hustl/common")
const { buildGateway, isBlockedPath, normalizePath, ROUTES } = await import("../src/app")
type Service = import("../src/app").Service

type Echo = { service: Service; method: string; url: string; body: string | null; headers: Record<string, string> }

const upstreams = new Map<Service, { server: FastifyInstance; url: string; hits: Echo[] }>()
let gateway: FastifyInstance

/** A stand-in upstream per service that records exactly what the gateway forwarded (raw body bytes included). */
async function startUpstream(service: Service) {
  const hits: Echo[] = []
  const server = Fastify()
  server.removeAllContentTypeParsers()
  server.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => done(null, body))
  server.all("/*", async (req) => {
    const echo: Echo = {
      service,
      method: req.method,
      url: req.url,
      body: Buffer.isBuffer(req.body) ? req.body.toString("base64") : null,
      headers: req.headers as Record<string, string>,
    }
    hits.push(echo)
    return echo
  })
  const url = await server.listen({ port: 0, host: "127.0.0.1" })
  upstreams.set(service, { server, url, hits })
}

const totalHits = () => [...upstreams.values()].reduce((n, u) => n + u.hits.length, 0)

beforeAll(async () => {
  const services = new Set<Service>([...ROUTES.map(([, s]) => s), "notification"])
  await Promise.all([...services].map(startUpstream))
  gateway = await buildGateway({
    corsOrigins: ["http://localhost:3000"],
    rateLimitPerMinute: 10_000,
    authRateLimitPerMinute: 20,
    trustProxy: false,
    upstreamFor: (s) => upstreams.get(s)!.url,
  })
  await gateway.ready()
})

afterAll(async () => {
  await gateway?.close()
  await Promise.all([...upstreams.values()].map((u) => u.server.close()))
})

beforeEach(() => {
  for (const u of upstreams.values()) u.hits.length = 0
})

describe("routing table", () => {
  it.each(ROUTES)("%s → %s service", async (prefix, service) => {
    const res = await gateway.inject({ method: "GET", url: `${prefix}/probe/123?x=1` })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({ service, url: `${prefix}/probe/123?x=1` })
  })

  it("prefers the most specific prefix", async () => {
    expect((await gateway.inject({ method: "GET", url: "/admin/users" })).json().service).toBe("user")
    expect((await gateway.inject({ method: "GET", url: "/admin/verifications/1/decision" })).json().service).toBe("user")
    expect((await gateway.inject({ method: "GET", url: "/admin/disputes" })).json().service).toBe("payment")
    expect((await gateway.inject({ method: "GET", url: "/admin/fraud-flags" })).json().service).toBe("creator")
    expect((await gateway.inject({ method: "GET", url: "/admin/metrics" })).json().service).toBe("analytics")
  })

  it("forwards method, request id and client ip", async () => {
    const res = await gateway.inject({ method: "PATCH", url: "/deals/1/status", payload: { action: "cancel" }, remoteAddress: "203.0.113.9" })
    const echo = res.json() as Echo
    expect(echo).toMatchObject({ service: "deal", method: "PATCH" })
    expect(echo.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/)
    expect(echo.headers["x-forwarded-for"]).toBe("203.0.113.9")
  })

  it("does not trust a client-supplied X-Forwarded-For by default", async () => {
    const res = await gateway.inject({ method: "GET", url: "/users/me", remoteAddress: "203.0.113.10", headers: { "x-forwarded-for": "1.2.3.4" } })
    expect(res.json().headers["x-forwarded-for"]).toBe("203.0.113.10")
  })

  it("returns 404 for unknown prefixes without calling any upstream", async () => {
    const res = await gateway.inject({ method: "GET", url: "/nope" })
    expect(res.statusCode).toBe(404)
    expect(totalHits()).toBe(0)
  })
})

describe("blocked routes", () => {
  it.each(["/internal/users/1", "/users/internal/x", "/deals/1/internal", "/%69nternal/users/1", "/INTERNAL/users/1", "//internal//users", "/ai/match", "/ai"])(
    "%s is never proxied",
    async (url) => {
      for (const method of ["GET", "POST"] as const) {
        const res = await gateway.inject({ method, url, headers: { "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN ?? "x" } })
        expect(res.statusCode).toBe(404)
        expect(res.json()).toMatchObject({ success: false, error: { code: "NOT_FOUND" } })
      }
      expect(totalHits()).toBe(0)
    },
  )

  it("normalises paths before matching", () => {
    expect(normalizePath("/Users/ME/?a=1")).toBe("/users/me")
    expect(normalizePath("/users/%69nternal/")).toBe("/users/internal")
    expect(isBlockedPath(normalizePath("/users/%69nternal/"))).toBe(true)
    expect(isBlockedPath(normalizePath("/users/internals"))).toBe(false)
    expect(isBlockedPath(normalizePath("/users/%69nternal/x"))).toBe(true)
    expect(isBlockedPath("/internalize")).toBe(false)
    expect(isBlockedPath("/aid")).toBe(false)
  })
})

describe("access token pre-verification", () => {
  it("rejects an invalid bearer token before proxying", async () => {
    const res = await gateway.inject({ method: "GET", url: "/users/me", headers: { authorization: "Bearer not-a-jwt" } })
    expect(res.statusCode).toBe(401)
    expect(totalHits()).toBe(0)
  })

  it("passes a valid token through", async () => {
    const token = signAccessToken({ id: "00000000-0000-4000-8000-000000000001", email: "a@b.co", role: "BRAND" })
    const res = await gateway.inject({ method: "GET", url: "/users/me", headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    expect(res.json().headers.authorization).toBe(`Bearer ${token}`)
  })

  it("doesn't block /auth/refresh when a stale access token is attached", async () => {
    const res = await gateway.inject({ method: "POST", url: "/auth/refresh", headers: { authorization: "Bearer expired.or.bad" }, payload: { refreshToken: "x" }, remoteAddress: "198.51.100.77" })
    expect(res.statusCode).toBe(200)
  })
})

describe("payment webhooks", () => {
  it.each([
    ["application/json", '{"id":"evt_1",  "type":"payment_intent.succeeded",\n "data":{"amount":1999}}\n'],
    ["application/x-www-form-urlencoded", "a=1&b=%20two&c="],
    ["application/octet-stream", Buffer.from([0x00, 0xff, 0x10, 0x7b, 0x0a]).toString("latin1")],
  ])("forwards %s bodies byte-for-byte without requiring a JWT", async (contentType, text) => {
    const bytes = Buffer.from(text, "latin1")
    const res = await gateway.inject({
      method: "POST",
      url: "/payments/webhooks/stripe",
      payload: bytes,
      headers: { "content-type": contentType, "stripe-signature": "t=1,v1=abc", authorization: "Bearer provider-does-not-send-jwts" },
    })
    expect(res.statusCode, res.body).toBe(200)
    const echo = res.json() as Echo
    expect(echo.service).toBe("payment")
    expect(Buffer.from(echo.body!, "base64").equals(bytes)).toBe(true)
    expect(echo.headers["stripe-signature"]).toBe("t=1,v1=abc")
    expect(echo.headers["content-type"]).toBe(contentType)
  })
})

describe("credential endpoint rate limiting", () => {
  it("limits each credential endpoint to 20/min per IP", async () => {
    const ip = "192.0.2.50"
    for (let i = 0; i < 20; i++) {
      const res = await gateway.inject({ method: "POST", url: "/auth/login", payload: { email: "a@b.co", password: "x" }, remoteAddress: ip })
      expect(res.statusCode).toBe(200)
    }
    const limited = await gateway.inject({ method: "POST", url: "/auth/login", payload: { email: "a@b.co", password: "x" }, remoteAddress: ip })
    expect(limited.statusCode).toBe(429)
    expect(limited.json()).toMatchObject({ success: false, error: { code: "RATE_LIMITED" } })
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0)
    // Query strings and trailing slashes don't open a fresh bucket.
    expect((await gateway.inject({ method: "POST", url: "/auth/login/?x=1", payload: {}, remoteAddress: ip })).statusCode).toBe(429)

    // Other IPs and other endpoints are unaffected; non-credential routes use the general limit.
    expect((await gateway.inject({ method: "POST", url: "/auth/login", payload: {}, remoteAddress: "192.0.2.51" })).statusCode).toBe(200)
    expect((await gateway.inject({ method: "POST", url: "/auth/register", payload: {}, remoteAddress: ip })).statusCode).toBe(200)
    for (let i = 0; i < 25; i++) expect((await gateway.inject({ method: "GET", url: "/users/me", remoteAddress: ip })).statusCode).toBe(200)
  })

  it.each(["/auth/register", "/auth/refresh", "/auth/google"])("%s is limited too", async (url) => {
    const ip = `192.0.2.${60 + ["/auth/register", "/auth/refresh", "/auth/google"].indexOf(url)}`
    const codes: number[] = []
    for (let i = 0; i < 21; i++) codes.push((await gateway.inject({ method: "POST", url, payload: {}, remoteAddress: ip })).statusCode)
    expect(codes.slice(0, 20).every((c) => c === 200)).toBe(true)
    expect(codes[20]).toBe(429)
  })
})
