// Typed service-to-service HTTP client with timeouts, retries (idempotent
// calls only) and error-envelope propagation.

import { AppError, errors, type ErrorBody, type SuccessBody } from "./errors"

type CallOptions = { timeoutMs?: number; retries?: number; userToken?: string; headers?: Record<string, string> }

export function serviceClient(name: string, baseUrl: string, defaults: CallOptions = {}) {
  async function call<T>(method: string, path: string, body?: unknown, opts: CallOptions = {}): Promise<T> {
    const o = { timeoutMs: 8000, retries: method === "GET" ? 2 : 0, ...defaults, ...opts }
    let attempt = 0
    for (;;) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), o.timeoutMs)
      try {
        const res = await fetch(`${baseUrl}${path}`, {
          method,
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN ?? "",
            ...(o.userToken && { authorization: `Bearer ${o.userToken}` }),
            ...o.headers,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
        const json = (await res.json().catch(() => null)) as SuccessBody<T> | ErrorBody | null
        if (res.ok && json?.success) return json.data
        if (res.status >= 500 && attempt < o.retries) throw new RetryableError()
        if (json && !json.success) throw new AppError(json.error.code, json.error.message, json.error.details)
        throw errors.serviceUnavailable(name)
      } catch (err) {
        if (err instanceof AppError) throw err
        if (attempt < o.retries) {
          attempt++
          await new Promise((r) => setTimeout(r, 150 * 2 ** attempt))
          continue
        }
        if ((err as Error).name === "AbortError") throw errors.timeout(name)
        throw errors.serviceUnavailable(name)
      } finally {
        clearTimeout(timer)
      }
    }
  }
  return {
    get: <T>(path: string, opts?: CallOptions) => call<T>("GET", path, undefined, opts),
    post: <T>(path: string, body?: unknown, opts?: CallOptions) => call<T>("POST", path, body, opts),
    patch: <T>(path: string, body?: unknown, opts?: CallOptions) => call<T>("PATCH", path, body, opts),
    put: <T>(path: string, body?: unknown, opts?: CallOptions) => call<T>("PUT", path, body, opts),
    delete: <T>(path: string, opts?: CallOptions) => call<T>("DELETE", path, undefined, opts),
  }
}

class RetryableError extends Error {}
