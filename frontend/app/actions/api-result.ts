import "server-only"
// Serialisable result wrapper for server actions that call the gateway.
// Keeps the ApiError code/status so client components can branch (409 contract
// changed, 503 service unavailable, 422 field errors) instead of guessing.
import type { ApiErrorCode } from "@hustl/contracts"
import { isApiError } from "@/lib/api/errors"

export type ApiActionOk<T> = { ok: true; data: T; meta?: Record<string, unknown> }
export type ApiActionFail = {
  ok: false
  status: number
  code: ApiErrorCode | "UNKNOWN"
  message: string
  details?: unknown
  fieldErrors?: Record<string, string>
}
export type ApiActionResult<T> = ApiActionOk<T> | ApiActionFail

function toFailure(err: unknown): ApiActionFail {
  if (isApiError(err)) {
    const fieldErrors = err.status === 422 ? err.fieldErrors : undefined
    return {
      ok: false,
      status: err.status,
      code: err.code,
      message: err.message,
      details: err.details,
      ...(fieldErrors && Object.keys(fieldErrors).length ? { fieldErrors } : {}),
    }
  }
  // Next.js control-flow errors (redirect / notFound) must keep bubbling.
  if (err instanceof Error && /NEXT_REDIRECT|NEXT_NOT_FOUND/.test(err.message)) throw err
  console.error(err)
  return { ok: false, status: 500, code: "UNKNOWN", message: "Something went wrong. Please try again." }
}

/** Runs a gateway call and converts thrown ApiErrors into a serialisable failure. */
export async function apiAction<T>(fn: () => Promise<T>): Promise<ApiActionResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (err) {
    return toFailure(err)
  }
}

/** Same, for calls that also return envelope `meta` (e.g. milestone approve → `meta.release`). */
export async function apiActionWithMeta<T, M extends Record<string, unknown>>(fn: () => Promise<{ data: T; meta: M }>): Promise<ApiActionResult<T>> {
  try {
    const { data, meta } = await fn()
    return { ok: true, data, meta }
  } catch (err) {
    return toFailure(err)
  }
}
