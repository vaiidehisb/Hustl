// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { ApiError, createRequester, buildQuery } from "@/lib/api/core"
import { createApi } from "@/lib/api/registry"
import { toFormError } from "@/lib/api/form-errors"

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
const okBody = (data: unknown, meta?: unknown) => ({ success: true, data, ...(meta ? { meta } : {}) })
const errBody = (code: string, message: string, details?: unknown) => ({ success: false, error: { code, message, details } })

function setup(responses: (Response | Error)[], opts: { token?: string | null } = {}) {
  const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => {
    const next = responses.shift()
    if (!next) throw new Error("no more responses")
    if (next instanceof Error) throw next
    return next
  })
  const r = createRequester({ baseUrl: "http://gw.test/", fetchImpl: fetchImpl as unknown as typeof fetch, getToken: async () => opts.token ?? "tok", retryDelayMs: 0 })
  return { r, fetchImpl }
}

describe("apiFetch envelope parsing", () => {
  it("unwraps success data and attaches the bearer token", async () => {
    const { r, fetchImpl } = setup([json(200, okBody({ id: "d1" }))])
    await expect(r<{ id: string }>("/deals/d1")).resolves.toEqual({ id: "d1" })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("http://gw.test/deals/d1")
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok")
    expect(init.cache).toBe("no-store")
  })

  it("returns meta with withMeta and serialises queries", async () => {
    const { r, fetchImpl } = setup([json(200, okBody([1, 2], { nextCursor: "c2" }))])
    const res = await r.withMeta<number[], { nextCursor: string }>("/notifications", { query: { unread: true, cursor: undefined, limit: 5 } })
    expect(res).toEqual({ data: [1, 2], meta: { nextCursor: "c2" } })
    expect(fetchImpl.mock.calls[0]![0]).toBe("http://gw.test/notifications?unread=true&limit=5")
  })

  it("sends JSON bodies and honours an explicit anonymous token", async () => {
    const { r, fetchImpl } = setup([json(201, okBody({ ok: 1 }))])
    await r("/auth/login", { method: "POST", body: { email: "a@b.co" }, token: null })
    const init = fetchImpl.mock.calls[0]![1] as unknown as RequestInit
    expect(init.body).toBe(JSON.stringify({ email: "a@b.co" }))
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json")
    expect((init.headers as Record<string, string>).authorization).toBeUndefined()
  })

  it("throws a typed ApiError from the error envelope", async () => {
    const { r } = setup([json(422, errBody("VALIDATION_ERROR", "Invalid request", { fieldErrors: { email: ["Enter a valid email address"] } }))])
    const err = await r("/auth/register", { method: "POST", body: {} }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 422, code: "VALIDATION_ERROR", message: "Invalid request" })
    expect((err as ApiError).fieldErrors).toEqual({ email: "Enter a valid email address" })
  })

  it("maps a non-envelope failure by status", async () => {
    const { r } = setup([new Response("<html>bad gateway</html>", { status: 502 }), new Response("nope", { status: 502 })])
    await expect(r("/x")).rejects.toMatchObject({ status: 502, code: "SERVICE_UNAVAILABLE" })
  })
})

describe("apiFetch retries", () => {
  it("retries a GET once on 503 and succeeds", async () => {
    const { r, fetchImpl } = setup([json(503, errBody("SERVICE_UNAVAILABLE", "down")), json(200, okBody("up"))])
    await expect(r("/briefs/open")).resolves.toBe("up")
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("gives up after one retry", async () => {
    const { r, fetchImpl } = setup([json(503, errBody("SERVICE_UNAVAILABLE", "down")), json(503, errBody("SERVICE_UNAVAILABLE", "still down"))])
    await expect(r("/briefs/open")).rejects.toMatchObject({ status: 503, code: "SERVICE_UNAVAILABLE", message: "still down" })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("does not retry 400 or 409", async () => {
    for (const [status, code] of [
      [400, "BAD_REQUEST"],
      [409, "CONFLICT"],
    ] as const) {
      const { r, fetchImpl } = setup([json(status, errBody(code, "nope")), json(200, okBody("unexpected"))])
      await expect(r("/deals/1")).rejects.toMatchObject({ status, code })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    }
  })

  it("does not retry non-GET requests", async () => {
    const { r, fetchImpl } = setup([json(503, errBody("SERVICE_UNAVAILABLE", "down")), json(200, okBody("x"))])
    await expect(r("/deals", { method: "POST", body: {} })).rejects.toMatchObject({ status: 503 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("maps network failures to SERVICE_UNAVAILABLE after retrying", async () => {
    const { r, fetchImpl } = setup([new TypeError("fetch failed"), new TypeError("fetch failed")])
    await expect(r("/users/me")).rejects.toMatchObject({ status: 503, code: "SERVICE_UNAVAILABLE" })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("maps a timeout to TIMEOUT", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
    )
    const r = createRequester({ baseUrl: "http://gw.test", fetchImpl: fetchImpl as unknown as typeof fetch, retries: 0, timeoutMs: 20 })
    await expect(r("/slow")).rejects.toMatchObject({ status: 504, code: "TIMEOUT" })
  })
})

describe("domain modules", () => {
  it("builds encoded paths and methods", async () => {
    const { r, fetchImpl } = setup([json(200, okBody({})), json(200, okBody({}))])
    const api = createApi(r)
    await api.deals.counter("a/b", { amount: 5000 })
    await api.creators.get("@Ana.Creates")
    expect(fetchImpl.mock.calls[0]![0]).toBe("http://gw.test/deals/a%2Fb/counter")
    expect((fetchImpl.mock.calls[0]![1] as unknown as RequestInit).method).toBe("POST")
    expect(fetchImpl.mock.calls[1]![0]).toBe("http://gw.test/creators/ana.creates")
  })

  it("buildQuery skips empty values and repeats arrays", () => {
    expect(buildQuery({ a: "", b: null, c: undefined, status: ["FUNDED", "IN_PROGRESS"], page: 2 })).toBe("?status=FUNDED&status=IN_PROGRESS&page=2")
  })
})

describe("toFormError", () => {
  it("puts a 409 duplicate email on the email field", () => {
    const e = toFormError(new ApiError(409, "CONFLICT", "An account with this email already exists", { field: "email" }))
    expect(e.fieldErrors).toEqual({ email: "An account with this email already exists. Log in instead." })
  })
  it("maps 422 fieldErrors, 429 and 503", () => {
    expect(toFormError(new ApiError(422, "VALIDATION_ERROR", "Invalid", { fieldErrors: { handle: ["Taken"] } })).fieldErrors).toEqual({ handle: "Taken" })
    expect(toFormError(new ApiError(429, "RATE_LIMITED", "slow down")).error).toMatch(/too many attempts/i)
    expect(toFormError(new ApiError(503, "SERVICE_UNAVAILABLE", "x")).error).toMatch(/service unavailable, try again/i)
  })
})
