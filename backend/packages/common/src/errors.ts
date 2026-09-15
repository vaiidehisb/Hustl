// One error envelope for every service and the gateway:
// { success: false, error: { code, message, details } }

export const ERROR_STATUS = {
  VALIDATION_ERROR: 422,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  INTEGRATION_UNAVAILABLE: 503,
  SERVICE_UNAVAILABLE: 503,
  TIMEOUT: 504,
} as const

export type ErrorCode = keyof typeof ERROR_STATUS

export type ErrorBody = { success: false; error: { code: ErrorCode; message: string; details?: unknown } }
export type SuccessBody<T> = { success: true; data: T; meta?: Record<string, unknown> }

export class AppError extends Error {
  readonly status: number
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = "AppError"
    this.status = ERROR_STATUS[code]
  }

  toBody(): ErrorBody {
    return { success: false, error: { code: this.code, message: this.message, ...(this.details !== undefined && { details: this.details }) } }
  }
}

export const errors = {
  badRequest: (message: string, details?: unknown) => new AppError("BAD_REQUEST", message, details),
  validation: (message: string, details?: unknown) => new AppError("VALIDATION_ERROR", message, details),
  unauthorized: (message = "Authentication required") => new AppError("UNAUTHORIZED", message),
  forbidden: (message = "You don't have access to this resource") => new AppError("FORBIDDEN", message),
  notFound: (what = "Resource") => new AppError("NOT_FOUND", `${what} not found`),
  conflict: (message: string, details?: unknown) => new AppError("CONFLICT", message, details),
  serviceUnavailable: (service: string) => new AppError("SERVICE_UNAVAILABLE", `${service} is temporarily unavailable`),
  timeout: (service: string) => new AppError("TIMEOUT", `${service} did not respond in time`),
  /** A third-party integration isn't configured. Never substitute fake data. */
  integrationUnavailable: (integration: string, missingEnv: string[]) =>
    new AppError("INTEGRATION_UNAVAILABLE", `${integration} is not configured`, { integration, missingEnv }),
}

export const ok = <T>(data: T, meta?: Record<string, unknown>): SuccessBody<T> => ({ success: true, data, ...(meta && { meta }) })
