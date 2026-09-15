// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { createGatewayProxy, resolveProxyPath } from "@/lib/api/proxy"

function makeProxy(upstream: Response | Error = new Response(JSON.stringify({ success: true, data: 1 }), { headers: { "content-type": "application/json" } })) {
  const fetchImpl = vi.fn(async () => {
    if (upstream instanceof Error) throw upstream
    return upstream
  })
  const proxy = createGatewayProxy({ baseUrl: "http://gw.test", getToken: async () => "session-token", fetchImpl: fetchImpl as unknown as typeof fetch })
  return { proxy, fetchImpl }
}

const req = (path: string, init?: RequestInit) => new Request(`http://app.test/api/gateway/${path}`, init)

describe("resolveProxyPath", () => {
  it.each([
    [["internal", "users", "1"]],
    [["INTERNAL", "users"]],
    [["ai", "match"]],
    [["Ai"]],
    [["users", "internal", "x"]],
    [["users", "..", "internal"]],
    [["users%2F..%2Finternal"]],
    [["deals", "a/b"]],
    [["%2e%2e", "internal"]],
    [[]],
  ])("blocks %j", (segments) => {
    expect(resolveProxyPath(segments)).toBeNull()
  })

  it("allows normal paths (and 'ai' deeper than the root)", () => {
    expect(resolveProxyPath(["deals", "d1", "counter"])).toBe("/deals/d1/counter")
    expect(resolveProxyPath(["briefs", "ai"])).toBe("/briefs/ai")
  })
})

describe("gateway proxy", () => {
  it("returns a 404 envelope for /internal and /ai without calling upstream", async () => {
    for (const segments of [["internal", "users", "1"], ["ai", "parse-brief"]]) {
      const { proxy, fetchImpl } = makeProxy()
      const res = await proxy(req(segments.join("/")), segments)
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ success: false, error: { code: "NOT_FOUND", message: "Not found" } })
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })

  it("forwards with the session token and query, passing the envelope through", async () => {
    const upstream = new Response(JSON.stringify({ success: false, error: { code: "CONFLICT", message: "Invalid transition" } }), {
      status: 409,
      headers: { "content-type": "application/json" },
    })
    const { proxy, fetchImpl } = makeProxy(upstream)
    const res = await proxy(req("deals/d1/accept?x=1", { method: "POST", body: "{}", headers: { "content-type": "application/json", authorization: "Bearer spoofed" } }), ["deals", "d1", "accept"])
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("http://gw.test/deals/d1/accept?x=1")
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer session-token")
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ success: false, error: { code: "CONFLICT", message: "Invalid transition" } })
  })

  it("streams binary bodies (PDF) with their headers", async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46])
    const { proxy } = makeProxy(new Response(pdf, { headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="kit.pdf"' } }))
    const res = await proxy(req("media/media-kit/c1"), ["media", "media-kit", "c1"])
    expect(res.headers.get("content-type")).toBe("application/pdf")
    expect(res.headers.get("content-disposition")).toContain("kit.pdf")
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(pdf)
  })

  it("maps an unreachable gateway to a 503 envelope", async () => {
    const { proxy } = makeProxy(new TypeError("fetch failed"))
    const res = await proxy(req("users/me"), ["users", "me"])
    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe("SERVICE_UNAVAILABLE")
  })
})
