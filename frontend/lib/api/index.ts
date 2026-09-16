import "server-only"
// Server entry point: `import { deals, briefs } from "@/lib/api"` → `await deals.get(id)`.
import { serverRequester } from "./client"
import { createApi } from "./registry"

export const api = createApi(serverRequester)
export const {
  auth,
  users,
  creators,
  brands,
  briefs,
  applications,
  deals,
  offers,
  payments,
  billing,
  messages,
  notifications,
  search,
  analytics,
  media,
  social,
  admin,
} = api

export { apiFetch, apiFetchRaw, apiFetchWithMeta, serverRequester } from "./client"
export { ApiError, isApiError, friendlyMessage } from "./errors"
export { mediaHref } from "./media"
export type { Api } from "./registry"
export type { CallOptions, Query, RequestOptions, WithMeta } from "./core"
export type * from "./types"
