import "server-only"
// Server-side gateway client. Next.js server → API Gateway → services.
// The bearer token comes from the NextAuth session JWT (never sent to the browser).
import { getAccessToken } from "@/lib/auth/token"
import { createRequester, type RequestOptions, type WithMeta } from "./core"
import { gatewayUrl } from "./gateway"

export { ApiError, isApiError, friendlyMessage } from "./errors"
export type { CallOptions, RequestOptions, Query, WithMeta } from "./core"

export const serverRequester = createRequester({
  get baseUrl() {
    return gatewayUrl()
  },
  getToken: getAccessToken,
})

/**
 * Fetch a gateway path and unwrap the envelope. Throws `ApiError { status, code, message, details }`.
 * - token: explicit bearer (`null` = anonymous); defaults to the session's access token.
 * - 10s timeout; GETs retry once on 502/503/504/network errors; network failures → SERVICE_UNAVAILABLE.
 * - `revalidate`/`tags` opt into the Next.js data cache; otherwise `cache: "no-store"`.
 */
export function apiFetch<T>(path: string, opts?: RequestOptions): Promise<T> {
  return serverRequester<T>(path, opts)
}

/** Like apiFetch but also returns the envelope `meta` (pagination, cursors). */
export function apiFetchWithMeta<T, M = Record<string, unknown>>(path: string, opts?: RequestOptions): Promise<WithMeta<T, M>> {
  return serverRequester.withMeta<T, M>(path, opts)
}

/** Raw upstream Response for streams (PDFs). Non-2xx still throws ApiError. */
export function apiFetchRaw(path: string, opts?: RequestOptions): Promise<Response> {
  return serverRequester.raw(path, opts)
}
