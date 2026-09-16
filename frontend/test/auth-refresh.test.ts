// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { JWT } from "next-auth/jwt"
import { __resetRefreshCache, shouldRefresh } from "@/lib/auth/refresh"
import { authOptions } from "@/lib/auth/options"

const user = { id: "u1", email: "a@b.co", name: "Ana", image: null, role: "CREATOR" as const }
const publicUser = { ...user, status: "ACTIVE", kycStatus: "NONE", hasPassword: true, googleLinked: false, lastLoginAt: null, createdAt: "2026-01-01T00:00:00Z" }

const baseToken = (expiresInMs: number): JWT => ({
  user,
  accessToken: "old-access",
  refreshToken: "old-refresh-0000000000000000000000000000",
  accessTokenExpiresAt: Date.now() + expiresInMs,
})

const envelope = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

type JwtArgs = Parameters<NonNullable<NonNullable<typeof authOptions.callbacks>["jwt"]>>[0]
const runJwt = (token: JWT, extra: Partial<JwtArgs> = {}) =>
  authOptions.callbacks!.jwt!({ token, user: undefined as never, account: null, ...extra } as JwtArgs) as Promise<JWT>

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  __resetRefreshCache()
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe("shouldRefresh", () => {
  it("refreshes within 60s of expiry only", () => {
    expect(shouldRefresh(baseToken(10 * 60_000))).toBe(false)
    expect(shouldRefresh(baseToken(30_000))).toBe(true)
    expect(shouldRefresh(baseToken(-1))).toBe(true)
  })
})

describe("jwt callback", () => {
  it("leaves a fresh token alone", async () => {
    const token = baseToken(10 * 60_000)
    await expect(runJwt(token)).resolves.toEqual(token)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rotates tokens via POST /auth/refresh shortly before expiry", async () => {
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString()
    fetchMock.mockResolvedValueOnce(
      envelope(200, { success: true, data: { user: publicUser, accessToken: "new-access", accessTokenExpiresAt: expiresAt, refreshToken: "new-refresh", refreshTokenExpiresAt: expiresAt } }),
    )
    const next = await runJwt(baseToken(20_000))

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("http://gateway.test/auth/refresh")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual({ refreshToken: "old-refresh-0000000000000000000000000000" })
    expect(next).toMatchObject({ accessToken: "new-access", refreshToken: "new-refresh", accessTokenExpiresAt: Date.parse(expiresAt), error: undefined })
  })

  it("sets RefreshTokenError when the refresh token is rejected", async () => {
    fetchMock.mockResolvedValueOnce(envelope(401, { success: false, error: { code: "UNAUTHORIZED", message: "Refresh token revoked" } }))
    const next = await runJwt(baseToken(-5_000))
    expect(next.error).toBe("RefreshTokenError")
  })

  it("keeps the session on a transient outage", async () => {
    fetchMock.mockResolvedValueOnce(envelope(503, { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } }))
    const token = baseToken(-5_000)
    const next = await runJwt(token)
    expect(next.error).toBeUndefined()
    expect(next.accessToken).toBe("old-access")
  })

  it("shares one refresh between concurrent callers", async () => {
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString()
    fetchMock.mockResolvedValue(envelope(200, { success: true, data: { user: publicUser, accessToken: "a2", accessTokenExpiresAt: expiresAt, refreshToken: "r2", refreshTokenExpiresAt: expiresAt } }))
    const token = baseToken(1_000)
    const [a, b] = await Promise.all([runJwt(token), runJwt({ ...token })])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(a.accessToken).toBe("a2")
    expect(b.accessToken).toBe("a2")
  })

  it("forces a new login for pre-gateway cookies", async () => {
    const next = await runJwt({ name: "old" } as unknown as JWT)
    expect(next.error).toBe("RefreshTokenError")
  })

  it("stores the gateway session on credentials sign-in", async () => {
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString()
    const next = await runJwt({} as JWT, {
      account: { provider: "credentials", type: "credentials", providerAccountId: "u1" },
      user: { id: "u1", authSession: { user: publicUser, accessToken: "acc", refreshToken: "ref", accessTokenExpiresAt: expiresAt, refreshTokenExpiresAt: expiresAt } } as never,
    })
    expect(next).toMatchObject({ user, accessToken: "acc", refreshToken: "ref" })
  })

  it("session callback never exposes tokens", async () => {
    const session = await authOptions.callbacks!.session!({ session: { expires: "x", user } as never, token: baseToken(60_000) } as never)
    expect(JSON.stringify(session)).not.toContain("old-access")
    expect(JSON.stringify(session)).not.toContain("old-refresh")
    expect(session).toMatchObject({ user })
  })
})
