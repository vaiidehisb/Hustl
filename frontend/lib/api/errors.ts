// Isomorphic error model for the gateway envelope:
// { success: false, error: { code, message, details } }
import type { ApiErrorCode } from "@hustl/contracts"

export type { ApiErrorCode }

const STATUS_CODE: Record<number, ApiErrorCode> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "VALIDATION_ERROR",
  429: "RATE_LIMITED",
  500: "INTERNAL_ERROR",
  502: "SERVICE_UNAVAILABLE",
  503: "SERVICE_UNAVAILABLE",
  504: "TIMEOUT",
}

export const codeForStatus = (status: number): ApiErrorCode => STATUS_CODE[status] ?? (status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST")

export class ApiError extends Error {
  readonly name = "ApiError"
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }

  /** zod `flatten()` field errors from a 422, first message per field. */
  get fieldErrors(): Record<string, string> {
    const raw = (this.details as { fieldErrors?: Record<string, string[] | string | undefined> } | undefined)?.fieldErrors
    const out: Record<string, string> = {}
    if (raw && typeof raw === "object") {
      for (const [k, v] of Object.entries(raw)) {
        const msg = Array.isArray(v) ? v[0] : v
        if (msg) out[k] = msg
      }
    }
    return out
  }

  /** The field a 409 refers to, e.g. `{ field: "email" }`. */
  get field(): string | undefined {
    const f = (this.details as { field?: unknown } | undefined)?.field
    return typeof f === "string" ? f : undefined
  }

  get isUnavailable() {
    return this.code === "SERVICE_UNAVAILABLE" || this.code === "INTEGRATION_UNAVAILABLE" || this.code === "TIMEOUT"
  }

  toJSON() {
    return { status: this.status, code: this.code, message: this.message, details: this.details }
  }
}

export const isApiError = (e: unknown): e is ApiError =>
  e instanceof ApiError || (typeof e === "object" && e !== null && (e as { name?: string }).name === "ApiError" && "status" in e && "code" in e)

export const serviceUnavailable = (message = "The service is temporarily unavailable. Please try again.") =>
  new ApiError(503, "SERVICE_UNAVAILABLE", message)

export const timeoutError = () => new ApiError(504, "TIMEOUT", "The service did not respond in time. Please try again.")

type Envelope = { success: true; data: unknown; meta?: Record<string, unknown> } | { success: false; error: { code: ApiErrorCode; message: string; details?: unknown } }

const isEnvelope = (v: unknown): v is Envelope => typeof v === "object" && v !== null && typeof (v as { success?: unknown }).success === "boolean"

/** Parse a gateway response into `{ data, meta }` or throw a typed ApiError. */
export async function parseEnvelope<T, M = Record<string, unknown>>(res: Response): Promise<{ data: T; meta: M }> {
  const text = await res.text()
  let body: unknown = undefined
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = undefined
    }
  }

  if (isEnvelope(body)) {
    if (body.success) return { data: body.data as T, meta: (body.meta ?? {}) as M }
    const status = res.ok ? 500 : res.status
    return Promise.reject(new ApiError(status, body.error?.code ?? codeForStatus(status), body.error?.message ?? res.statusText, body.error?.details))
  }

  if (!res.ok) {
    const code = codeForStatus(res.status)
    const message = code === "SERVICE_UNAVAILABLE" ? "The service is temporarily unavailable. Please try again." : res.statusText || "Request failed"
    throw new ApiError(res.status, code, message)
  }
  // A 2xx without an envelope (e.g. 204): hand back the raw body.
  return { data: body as T, meta: {} as M }
}

/** User-facing copy for common failures. */
export function friendlyMessage(e: unknown): string {
  if (!isApiError(e)) return "Something went wrong. Please try again."
  switch (e.code) {
    case "RATE_LIMITED":
      return "Too many attempts. Please wait a minute and try again."
    case "SERVICE_UNAVAILABLE":
    case "TIMEOUT":
      return "Service unavailable, try again in a moment."
    case "INTEGRATION_UNAVAILABLE":
      return e.message || "This integration isn't configured yet."
    case "UNAUTHORIZED":
      return "Your session has expired. Please log in again."
    case "FORBIDDEN":
      return e.message || "You don't have access to this."
    case "INTERNAL_ERROR":
      return "Something went wrong on our side. Please try again."
    default:
      return e.message || "Something went wrong. Please try again."
  }
}
