// Outbound calls: payment-service (internal) and the AI backend. Clients are
// created per call so URLs/tokens are read from the current environment.

import { AppError, errors, serviceClient, serviceUrl } from "@hustl/common"

export const paymentClient = () => serviceClient("payment-service", serviceUrl("payment"), { timeoutMs: 15_000 })

/**
 * POST to the AI backend (`/ai/*`, header x-internal-token). Accepts a bare JSON
 * payload or a `{ success, data }` envelope. Outages (unreachable, 5xx, timeout,
 * not configured) → 503 SERVICE_UNAVAILABLE; AI 4xx errors pass through as 4xx.
 */
export async function aiPost<T>(path: string, body: unknown, timeoutMs = 10_000): Promise<T> {
  const base = process.env.AI_SERVICE_URL
  if (!base) throw errors.serviceUnavailable("AI service")
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", "x-internal-token": process.env.AI_INTERNAL_TOKEN ?? process.env.INTERNAL_SERVICE_TOKEN ?? "" },
      body: JSON.stringify(body ?? {}),
    })
    const json = (await res.json().catch(() => null)) as unknown
    if (res.status >= 500 || json === null) throw errors.serviceUnavailable("AI service")
    const envelope = json as { success?: boolean; data?: unknown; error?: { code: string; message: string; details?: unknown }; detail?: unknown }
    if (!res.ok) {
      if (envelope.error?.code) throw new AppError(envelope.error.code as ConstructorParameters<typeof AppError>[0], envelope.error.message, envelope.error.details)
      throw errors.badRequest("AI service rejected the request", envelope.detail ?? json)
    }
    return (typeof envelope === "object" && "success" in envelope && "data" in envelope ? envelope.data : json) as T
  } catch (err) {
    if (err instanceof AppError && err.status < 500) throw err
    throw errors.serviceUnavailable("AI service")
  } finally {
    clearTimeout(timer)
  }
}
