// Phyllo REST adapter (https://docs.getphyllo.com). Basic auth with the client
// id/secret. No data is ever synthesised: when credentials are missing every
// call fails with 503 INTEGRATION_UNAVAILABLE.

import { createHmac, timingSafeEqual } from "node:crypto"
import { AppError, errors } from "@hustl/common"
import type { SocialPlatform } from "@hustl/contracts"

export type PhylloEnvironment = "sandbox" | "staging" | "production"

const BASE_URLS: Record<PhylloEnvironment, string> = {
  sandbox: "https://api.sandbox.getphyllo.com",
  staging: "https://api.staging.getphyllo.com",
  production: "https://api.getphyllo.com",
}

export const PHYLLO_PRODUCTS = ["IDENTITY", "ENGAGEMENT", "IDENTITY.AUDIENCE"] as const

export function phylloEnvironment(): PhylloEnvironment {
  const env = (process.env.PHYLLO_ENVIRONMENT ?? "sandbox").toLowerCase()
  return env === "production" || env === "staging" ? env : "sandbox"
}

export function phylloStatus() {
  const missingEnv = ["PHYLLO_CLIENT_ID", "PHYLLO_CLIENT_SECRET"].filter((k) => !process.env[k])
  return {
    configured: missingEnv.length === 0,
    missingEnv,
    environment: phylloEnvironment(),
    webhookConfigured: !!process.env.PHYLLO_WEBHOOK_SECRET,
  }
}

export function assertPhylloConfigured() {
  const s = phylloStatus()
  if (!s.configured) throw errors.integrationUnavailable("Phyllo", s.missingEnv)
}

// ─── Phyllo response shapes (only the fields we use) ─────────────────────────

export type PhylloUser = { id: string; name: string; external_id: string }
export type PhylloSdkTokenResponse = { sdk_token: string; expires_at: string }
export type PhylloWorkPlatform = { id: string; name: string; logo_url?: string }
export type PhylloAccount = {
  id: string
  user: { id: string; name?: string }
  work_platform: PhylloWorkPlatform
  username?: string | null
  platform_username?: string | null
  profile_pic_url?: string | null
  status: string // CONNECTED | NOT_CONNECTED | SESSION_EXPIRED
}
export type PhylloProfile = {
  id: string
  account: { id: string }
  work_platform: PhylloWorkPlatform
  username?: string | null
  platform_username?: string | null
  url?: string | null
  reputation?: {
    follower_count?: number | null
    following_count?: number | null
    subscriber_count?: number | null
    content_count?: number | null
  } | null
}
export type PhylloContent = {
  id: string
  engagement?: {
    like_count?: number | null
    comment_count?: number | null
    view_count?: number | null
  } | null
}
export type PhylloAudience = Record<string, unknown>
type PhylloList<T> = { data: T[]; metadata?: { offset: number; limit: number } }

const PLATFORM_BY_NAME: Record<string, SocialPlatform> = {
  instagram: "INSTAGRAM",
  youtube: "YOUTUBE",
  tiktok: "TIKTOK",
  linkedin: "LINKEDIN",
  x: "X",
  twitter: "X",
}

/** Maps a Phyllo work platform name to our enum; null for platforms we don't support. */
export function mapWorkPlatform(name: string | undefined | null): SocialPlatform | null {
  if (!name) return null
  return PLATFORM_BY_NAME[name.trim().toLowerCase()] ?? null
}

export class PhylloApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message)
    this.name = "PhylloApiError"
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  assertPhylloConfigured()
  const auth = Buffer.from(`${process.env.PHYLLO_CLIENT_ID}:${process.env.PHYLLO_CLIENT_SECRET}`).toString("base64")
  let res: Response
  try {
    res = await fetch(`${BASE_URLS[phylloEnvironment()]}${path}`, {
      method,
      headers: { authorization: `Basic ${auth}`, "content-type": "application/json", accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (err) {
    if ((err as Error).name === "TimeoutError") throw errors.timeout("Phyllo")
    throw errors.serviceUnavailable("Phyllo")
  }
  const json = (await res.json().catch(() => null)) as (T & { error?: { code?: string; message?: string; error_code?: string } }) | null
  if (!res.ok) {
    const e = json?.error
    throw new PhylloApiError(res.status, e?.error_code ?? e?.code, e?.message ?? `Phyllo ${method} ${path} failed with ${res.status}`)
  }
  return json as T
}

/** Converts adapter failures into API errors for route handlers. */
export function toAppError(err: unknown): unknown {
  if (err instanceof PhylloApiError) {
    if (err.status === 401 || err.status === 403) return new AppError("INTEGRATION_UNAVAILABLE", "Phyllo rejected the configured credentials", { integration: "Phyllo" })
    if (err.status === 404) return errors.notFound("Phyllo resource")
    if (err.status >= 500) return errors.serviceUnavailable("Phyllo")
    return errors.badRequest(err.message, { integration: "Phyllo", code: err.code })
  }
  return err
}

export const phyllo = {
  async getUserByExternalId(externalId: string): Promise<PhylloUser | null> {
    try {
      return await request<PhylloUser>("GET", `/v1/users/external_id/${encodeURIComponent(externalId)}`)
    } catch (err) {
      if (err instanceof PhylloApiError && err.status === 404) return null
      throw err
    }
  },

  getUser: (id: string) => request<PhylloUser>("GET", `/v1/users/${encodeURIComponent(id)}`),

  /** Idempotent: returns the existing Phyllo user for this external id when present. */
  async getOrCreateUser(externalId: string, name: string): Promise<PhylloUser> {
    const existing = await phyllo.getUserByExternalId(externalId)
    if (existing) return existing
    try {
      return await request<PhylloUser>("POST", "/v1/users", { name, external_id: externalId })
    } catch (err) {
      // Lost a race with a concurrent create.
      if (err instanceof PhylloApiError && (err.status === 400 || err.status === 409)) {
        const again = await phyllo.getUserByExternalId(externalId)
        if (again) return again
      }
      throw err
    }
  },

  createSdkToken: (userId: string) =>
    request<PhylloSdkTokenResponse>("POST", "/v1/sdk-tokens", { user_id: userId, products: [...PHYLLO_PRODUCTS] }),

  async listAccounts(userId: string): Promise<PhylloAccount[]> {
    const out: PhylloAccount[] = []
    for (let offset = 0; ; offset += 100) {
      const page = await request<PhylloList<PhylloAccount>>("GET", `/v1/accounts?user_id=${encodeURIComponent(userId)}&limit=100&offset=${offset}`)
      out.push(...page.data)
      if (page.data.length < 100) return out
    }
  },

  getAccount: (accountId: string) => request<PhylloAccount>("GET", `/v1/accounts/${encodeURIComponent(accountId)}`),

  async getProfile(accountId: string): Promise<PhylloProfile | null> {
    const page = await request<PhylloList<PhylloProfile>>("GET", `/v1/profiles?account_id=${encodeURIComponent(accountId)}`)
    return page.data[0] ?? null
  },

  async getAudience(accountId: string): Promise<PhylloAudience | null> {
    try {
      return await request<PhylloAudience>("GET", `/v1/audience?account_id=${encodeURIComponent(accountId)}`)
    } catch (err) {
      // Audience data is not available for every platform/account size.
      if (err instanceof PhylloApiError && (err.status === 404 || err.status === 400)) return null
      throw err
    }
  },

  async listRecentContents(accountId: string, limit = 30): Promise<PhylloContent[]> {
    const page = await request<PhylloList<PhylloContent>>("GET", `/v1/social/contents?account_id=${encodeURIComponent(accountId)}&limit=${limit}`)
    return page.data
  },

  async disconnectAccount(accountId: string) {
    try {
      await request("POST", `/v1/accounts/${encodeURIComponent(accountId)}/disconnect`)
    } catch (err) {
      if (err instanceof PhylloApiError && (err.status === 404 || err.status === 400)) return
      throw err
    }
  },
}

/** Average engagement over recent content, as a fraction of followers. Null without enough data. */
export function engagementFromContents(contents: PhylloContent[], followers: number | null) {
  const withEngagement = contents.filter((c) => c.engagement && (c.engagement.like_count != null || c.engagement.comment_count != null))
  const avg = (vals: (number | null | undefined)[]) => {
    const nums = vals.filter((v): v is number => typeof v === "number")
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null
  }
  const avgLikes = avg(withEngagement.map((c) => c.engagement?.like_count))
  const avgComments = avg(withEngagement.map((c) => c.engagement?.comment_count))
  const avgViews = avg(contents.map((c) => c.engagement?.view_count))
  const engagementRate =
    followers && followers > 0 && (avgLikes !== null || avgComments !== null) ? ((avgLikes ?? 0) + (avgComments ?? 0)) / followers : null
  return { avgLikes, avgComments, avgViews, engagementRate }
}

/**
 * Verifies a Phyllo webhook: HMAC-SHA256 of the raw body with PHYLLO_WEBHOOK_SECRET,
 * hex encoded. The header may carry several comma-separated signatures.
 */
export function verifyWebhookSignature(rawBody: Buffer, header: string | undefined, secret: string) {
  if (!header) return false
  const expected = createHmac("sha256", secret).update(rawBody).digest()
  return header
    .split(",")
    .map((s) => s.trim().replace(/^(sha256=|v1,)/, ""))
    .some((candidate) => {
      const buf = /^[0-9a-f]+$/i.test(candidate) ? Buffer.from(candidate, "hex") : Buffer.from(candidate, "base64")
      return buf.length === expected.length && timingSafeEqual(buf, expected)
    })
}
