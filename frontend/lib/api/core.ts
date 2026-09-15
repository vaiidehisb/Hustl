// Transport-agnostic request core shared by the server client (gateway) and
// the browser client (BFF proxy). No Next.js or next-auth imports here.
import { ApiError, parseEnvelope, serviceUnavailable, timeoutError } from "./errors"

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
export type QueryValue = string | number | boolean | null | undefined | Date | (string | number | boolean)[]
export type Query = Record<string, QueryValue>

/** Per-call options every domain function accepts as its last argument. */
export type CallOptions = {
  /** Explicit bearer token. `null` sends the request anonymously; omit to use the session. */
  token?: string | null
  signal?: AbortSignal
  /** Next.js data cache: seconds to revalidate (server only). Implies a cached, anonymous-safe fetch. */
  revalidate?: number | false
  cache?: RequestCache
  tags?: string[]
  headers?: Record<string, string>
  timeoutMs?: number
}

export type RequestOptions = CallOptions & {
  method?: HttpMethod
  query?: Query
  body?: unknown
}

export type WithMeta<T, M = Record<string, unknown>> = { data: T; meta: M }

export interface Requester {
  <T>(path: string, opts?: RequestOptions): Promise<T>
  withMeta<T, M = Record<string, unknown>>(path: string, opts?: RequestOptions): Promise<WithMeta<T, M>>
  /** The raw upstream Response (non-2xx still throws). Use for PDFs / streams. */
  raw(path: string, opts?: RequestOptions): Promise<Response>
}

export type RequesterConfig = {
  baseUrl: string
  /** Resolves the bearer token when `opts.token` is undefined. */
  getToken?: () => Promise<string | null | undefined>
  fetchImpl?: typeof fetch
  timeoutMs?: number
  /** Retries for idempotent GETs on 502/503/504 and network errors. */
  retries?: number
  retryDelayMs?: number
  /** Extra headers for every request. */
  defaultHeaders?: Record<string, string>
}

export const DEFAULT_TIMEOUT_MS = 10_000
const RETRYABLE_STATUS = new Set([502, 503, 504])

export function buildQuery(query?: Query): string {
  if (!query) return ""
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue
    if (Array.isArray(value)) value.forEach((v) => params.append(key, String(v)))
    else params.append(key, value instanceof Date ? value.toISOString() : String(value))
  }
  const s = params.toString()
  return s ? `?${s}` : ""
}

/** Encode a single path segment: `/deals/${seg(id)}`. */
export const seg = (v: string | number) => encodeURIComponent(String(v))

export function joinUrl(base: string, path: string) {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`
}

const isRawBody = (b: unknown): b is BodyInit =>
  typeof b === "string" ||
  (typeof Blob !== "undefined" && b instanceof Blob) ||
  (typeof FormData !== "undefined" && b instanceof FormData) ||
  (typeof URLSearchParams !== "undefined" && b instanceof URLSearchParams) ||
  b instanceof ArrayBuffer ||
  ArrayBuffer.isView(b) ||
  (typeof ReadableStream !== "undefined" && b instanceof ReadableStream)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function createRequester(config: RequesterConfig): Requester {
  const fetchImpl = config.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const retries = config.retries ?? 1
  const retryDelay = config.retryDelayMs ?? 200

  async function send(path: string, opts: RequestOptions = {}): Promise<Response> {
    const method = opts.method ?? "GET"
    const url = joinUrl(config.baseUrl, path) + buildQuery(opts.query)

    const headers: Record<string, string> = { accept: "application/json", ...config.defaultHeaders, ...opts.headers }
    let body: BodyInit | undefined
    if (opts.body !== undefined && method !== "GET") {
      if (isRawBody(opts.body)) body = opts.body
      else {
        body = JSON.stringify(opts.body)
        headers["content-type"] ??= "application/json"
      }
    }

    const token = opts.token !== undefined ? opts.token : await config.getToken?.()
    if (token) headers.authorization = `Bearer ${token}`

    const init: RequestInit & { next?: { revalidate?: number | false; tags?: string[] } } = { method, headers, body }
    if (opts.revalidate !== undefined || opts.tags) init.next = { revalidate: opts.revalidate, tags: opts.tags }
    if (opts.cache) init.cache = opts.cache
    else if (opts.revalidate === undefined) init.cache = "no-store"

    const canRetry = method === "GET" && !(typeof ReadableStream !== "undefined" && body instanceof ReadableStream)
    const timeoutMs = opts.timeoutMs ?? config.timeoutMs ?? DEFAULT_TIMEOUT_MS

    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController()
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, timeoutMs)
      const onAbort = () => controller.abort()
      opts.signal?.addEventListener("abort", onAbort, { once: true })

      try {
        if (opts.signal?.aborted) throw opts.signal.reason ?? new DOMException("Aborted", "AbortError")
        const res = await fetchImpl(url, { ...init, signal: controller.signal })
        if (canRetry && attempt < retries && RETRYABLE_STATUS.has(res.status)) {
          await res.body?.cancel().catch(() => undefined)
          await sleep(retryDelay)
          continue
        }
        return res
      } catch (err) {
        if (opts.signal?.aborted) throw err
        if (canRetry && attempt < retries) {
          await sleep(retryDelay)
          continue
        }
        throw timedOut ? timeoutError() : serviceUnavailable()
      } finally {
        clearTimeout(timer)
        opts.signal?.removeEventListener("abort", onAbort)
      }
    }
  }

  const requester = (async <T>(path: string, opts?: RequestOptions) => (await parseEnvelope<T>(await send(path, opts))).data) as Requester
  requester.withMeta = async <T, M>(path: string, opts?: RequestOptions) => parseEnvelope<T, M>(await send(path, opts))
  requester.raw = async (path: string, opts?: RequestOptions) => {
    const res = await send(path, { ...opts, headers: { accept: "*/*", ...opts?.headers } })
    if (!res.ok) await parseEnvelope(res) // throws ApiError
    return res
  }
  return requester
}

export { ApiError }
