// Turns API / zod failures into a serialisable form result for server actions.
import type { ZodError } from "zod"
import { friendlyMessage, isApiError } from "./errors"

export type FormError = { ok: false; code: string; error: string; fieldErrors?: Record<string, string> }
export type FormResult<T> = { ok: true; data: T } | FormError

export function zodFieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form"
    out[key] ??= issue.message
  }
  return out
}

export const validationFailure = (error: ZodError): FormError => ({
  ok: false,
  code: "VALIDATION_ERROR",
  error: "Please fix the highlighted fields.",
  fieldErrors: zodFieldErrors(error),
})

export function toFormError(err: unknown): FormError {
  if (!isApiError(err)) return { ok: false, code: "INTERNAL_ERROR", error: "Something went wrong. Please try again." }

  switch (err.status) {
    case 409: {
      const field = err.field ?? (/email/i.test(err.message) ? "email" : /handle/i.test(err.message) ? "handle" : undefined)
      const message = field === "email" ? "An account with this email already exists. Log in instead." : err.message
      return { ok: false, code: err.code, error: message, fieldErrors: field ? { [field]: message } : undefined }
    }
    case 422: {
      const fieldErrors = err.fieldErrors
      const hasFields = Object.keys(fieldErrors).length > 0
      return { ok: false, code: err.code, error: hasFields ? "Please fix the highlighted fields." : err.message, fieldErrors: hasFields ? fieldErrors : undefined }
    }
    case 429:
      return { ok: false, code: err.code, error: "Too many attempts. Please wait a minute and try again." }
    case 502:
    case 503:
    case 504:
      return { ok: false, code: err.code, error: err.code === "INTEGRATION_UNAVAILABLE" ? friendlyMessage(err) : "Service unavailable, try again in a moment." }
    default:
      return { ok: false, code: err.code, error: friendlyMessage(err) }
  }
}
