// Access-token refresh for the NextAuth JWT. Edge-safe (used by middleware too).
import type { JWT } from "next-auth/jwt"
import type { AuthSession, PublicUser } from "@hustl/contracts"
import { authApi } from "@/lib/api/auth"
import { isApiError } from "@/lib/api/errors"
import { anonymousRequester } from "@/lib/api/gateway"
import type { Requester } from "@/lib/api/core"

/** Refresh this long before expiry (jwt callback). Middleware uses a wider window so it wins. */
export const REFRESH_WINDOW_MS = 60_000
export const MIDDLEWARE_REFRESH_WINDOW_MS = 120_000

export type SessionUser = { id: string; email: string; name: string; image: string | null; role: PublicUser["role"] }

export const toSessionUser = (u: PublicUser): SessionUser => ({ id: u.id, email: u.email, name: u.name, image: u.image, role: u.role })

export function tokenFromAuthSession(s: Pick<AuthSession, "user" | "accessToken" | "accessTokenExpiresAt"> & { refreshToken?: string }, prev?: JWT): JWT {
  return {
    ...prev,
    user: toSessionUser(s.user),
    accessToken: s.accessToken,
    accessTokenExpiresAt: Date.parse(s.accessTokenExpiresAt),
    refreshToken: s.refreshToken ?? prev?.refreshToken ?? "",
    error: undefined,
  }
}

export function shouldRefresh(token: Pick<JWT, "accessTokenExpiresAt" | "refreshToken">, windowMs = REFRESH_WINDOW_MS, now = Date.now()) {
  if (!token.refreshToken || !token.accessTokenExpiresAt) return false
  return now >= token.accessTokenExpiresAt - windowMs
}

// Refresh tokens are single-use: concurrent refreshes of the same token in this
// process share one request (and its result for a short grace period).
const inflight = new Map<string, { promise: Promise<JWT>; at: number }>()
const GRACE_MS = 30_000

export function refreshAccessToken(token: JWT, requester: Requester = anonymousRequester): Promise<JWT> {
  const key = token.refreshToken
  const now = Date.now()
  for (const [k, v] of inflight) if (now - v.at > GRACE_MS) inflight.delete(k)
  const existing = inflight.get(key)
  if (existing) return existing.promise

  const promise = (async (): Promise<JWT> => {
    try {
      const s = await authApi(requester).refresh({ refreshToken: token.refreshToken })
      return tokenFromAuthSession(s, token)
    } catch (err) {
      // Transient outage: keep the session and try again on the next request.
      if (isApiError(err) && err.isUnavailable) return token
      // Revoked / expired / reused refresh token: the session is over.
      return { ...token, error: "RefreshTokenError" }
    }
  })()
  inflight.set(key, { promise, at: now })
  return promise
}

/** Test helper. */
export const __resetRefreshCache = () => inflight.clear()
