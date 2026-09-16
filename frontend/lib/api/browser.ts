"use client"
// Browser client: same typed modules, transported through the same-origin BFF
// proxy (/api/gateway/*), which attaches the session token server-side.
import { createRequester, type RequestOptions, type WithMeta } from "./core"
import { createApi } from "./registry"

export const GATEWAY_PROXY_BASE = "/api/gateway"

const browserRequester = createRequester({
  baseUrl: GATEWAY_PROXY_BASE,
  // The proxy owns auth; never send a bearer from the browser.
  getToken: async () => null,
  // The proxy doesn't retry, so keep one GET retry here for flaky networks.
  retries: 1,
})

/** Typed fetcher for client components / React Query. Throws ApiError. */
export function browserFetch<T>(path: string, opts?: Omit<RequestOptions, "token" | "revalidate" | "tags">): Promise<T> {
  return browserRequester<T>(path, { ...opts, token: null })
}

export function browserFetchWithMeta<T, M = Record<string, unknown>>(path: string, opts?: Omit<RequestOptions, "token" | "revalidate" | "tags">): Promise<WithMeta<T, M>> {
  return browserRequester.withMeta<T, M>(path, { ...opts, token: null })
}

/** `browserApi.notifications.list()` etc. — identical signatures to the server `api`. */
export const browserApi = createApi(browserRequester)

export { ApiError, isApiError, friendlyMessage } from "./errors"
export { queryKeys } from "./query-keys"
