// API Gateway — the only backend entry point for clients.
// Responsibilities: routing, JWT pre-verification, rate limiting, CORS,
// request ids, blocking internal routes. Services still authorise every call.
// (Kong is the documented production gateway; this service implements the
// same routing contract and is what docker-compose runs.)

import Fastify, { type FastifyRequest } from "fastify"
import cors from "@fastify/cors"
import helmet from "@fastify/helmet"
import rateLimit from "@fastify/rate-limit"
import proxy from "@fastify/http-proxy"
import { AppError, loggerOptions, ok, registerErrorHandler, serviceUrl, SERVICE_PORTS, verifyAccessToken } from "@hustl/common"

export type Service = Exclude<keyof typeof SERVICE_PORTS, "gateway">

/** prefix → owning service. Order matters: most specific first. */
export const ROUTES: [prefix: string, service: Service][] = [
  ["/admin/users", "user"],
  ["/admin/verifications", "user"],
  ["/admin/disputes", "payment"],
  ["/admin/fraud-flags", "creator"],
  ["/admin/metrics", "analytics"],
  ["/auth", "user"],
  ["/users", "user"],
  ["/creators", "user"],
  ["/brands", "user"],
  ["/verifications", "user"],
  ["/briefs", "deal"],
  ["/applications", "deal"],
  ["/deals", "deal"],
  ["/payments", "payment"],
  ["/social", "creator"],
  ["/search", "search"],
  ["/notifications", "notification"],
  ["/conversations", "notification"],
  ["/analytics", "analytics"],
  ["/media", "media"],
]

/** Credential endpoints get a much stricter per-IP, per-path limit (brute force / credential stuffing). */
export const CREDENTIAL_PATHS = new Set(["/auth/login", "/auth/register", "/auth/refresh", "/auth/google"])

/** Payment provider webhooks: raw body forwarded byte-for-byte for signature checks; no JWT, no global limit. */
export const WEBHOOK_PREFIX = "/payments/webhooks/"

export type GatewayOptions = {
  corsOrigins: string[]
  rateLimitPerMinute: number
  authRateLimitPerMinute: number
  /** Fastify trustProxy: only trust X-Forwarded-For from known proxies, otherwise clients can spoof their IP past the limits. */
  trustProxy: boolean | number | string
  logger?: boolean
  upstreamFor?: (service: Service) => string
}

/** Path without query, percent-decoded once (so `/%69nternal` can't slip past), lowercased, duplicate/trailing slashes collapsed. */
export function normalizePath(url: string) {
  const raw = url.split("?")[0] || "/"
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    // Malformed escape sequence: check the raw form; the upstream router will reject it.
  }
  const collapsed = decoded.toLowerCase().replace(/\/{2,}/g, "/")
  return collapsed.length > 1 ? collapsed.replace(/\/+$/, "") : collapsed
}

/** Internal service-to-service routes and the AI backend are never reachable from outside. */
export function isBlockedPath(path: string) {
  return /(^|\/)internal(\/|$)/.test(path) || path === "/ai" || path.startsWith("/ai/")
}

/** Client-first X-Forwarded-For chain as far as the gateway trusts it. */
const forwardedFor = (req: Pick<FastifyRequest, "ip" | "ips">) => [...(req.ips?.length ? req.ips : [req.ip])].reverse().join(", ")

export async function buildGateway(opts: GatewayOptions) {
  const upstreamFor = opts.upstreamFor ?? ((s: Service) => serviceUrl(s))
  // A hop count means "trust the nearest N proxies" (proxy-addr semantics); Fastify's types only accept the function form.
  const trustProxy = typeof opts.trustProxy === "number" ? ((hops: number) => (_addr: string, i: number) => i < hops)(opts.trustProxy) : opts.trustProxy
  const app = Fastify({ logger: opts.logger ? loggerOptions("gateway") : false, trustProxy, genReqId: () => crypto.randomUUID() })
  registerErrorHandler(app)

  await app.register(helmet, { global: true })
  await app.register(cors, { origin: opts.corsOrigins, credentials: true })
  await app.register(rateLimit, {
    max: opts.rateLimitPerMinute,
    timeWindow: "1 minute",
    keyGenerator: (req) => (req.headers.authorization ? `u:${req.headers.authorization.slice(-24)}` : `ip:${req.ip}`),
    allowList: (req) => normalizePath(req.url).startsWith(WEBHOOK_PREFIX),
    errorResponseBuilder: () => new AppError("RATE_LIMITED", "Too many requests — slow down and retry shortly").toBody(),
  })

  // Proxied routes can't carry per-route `config.rateLimit`, so the credential limiter is applied explicitly in onRequest.
  const credentialLimiter = app.createRateLimit({
    max: opts.authRateLimitPerMinute,
    timeWindow: 60_000,
    keyGenerator: (req) => `auth:${normalizePath(req.url)}:${req.ip}`,
  })

  app.addHook("onRequest", async (req, reply) => {
    const path = normalizePath(req.url)
    if (isBlockedPath(path)) throw new AppError("NOT_FOUND", "Route not found")

    if (CREDENTIAL_PATHS.has(path)) {
      const limit = await credentialLimiter(req)
      if (!limit.isAllowed && limit.isExceeded) {
        reply.header("retry-after", limit.ttlInSeconds)
        throw new AppError("RATE_LIMITED", "Too many attempts — please wait a minute and try again")
      }
    }

    // Reject bad/expired tokens early; services re-verify and authorise. Auth endpoints (e.g. refresh with an
    // expired access token still attached) and provider webhooks don't use the access token.
    const auth = req.headers.authorization
    if (auth?.startsWith("Bearer ") && !path.startsWith("/auth/") && !path.startsWith(WEBHOOK_PREFIX)) verifyAccessToken(auth.slice(7))
    req.headers["x-request-id"] = req.id
  })

  app.get("/health", async () => {
    const services = await Promise.all(
      (Object.keys(SERVICE_PORTS) as (keyof typeof SERVICE_PORTS)[])
        .filter((s): s is Service => s !== "gateway")
        .map(async (s) => {
          try {
            const res = await fetch(`${upstreamFor(s)}/health`, { signal: AbortSignal.timeout(2000) })
            return [s, res.ok ? "ok" : `degraded (${res.status})`] as const
          } catch {
            return [s, "down"] as const
          }
        }),
    )
    return ok({ service: "gateway", services: Object.fromEntries(services) })
  })

  for (const [prefix, service] of ROUTES) {
    // @fastify/http-proxy registers a pass-through content-type parser in its scope, so request bodies
    // (including webhook payloads) are streamed upstream unparsed and byte-identical.
    await app.register(proxy, {
      upstream: upstreamFor(service),
      prefix,
      rewritePrefix: prefix,
      http2: false,
      replyOptions: {
        rewriteRequestHeaders: (req, headers) => ({
          ...headers,
          "x-request-id": req.id,
          "x-forwarded-for": forwardedFor(req),
          "x-forwarded-proto": req.protocol,
        }),
        onError: (reply, { error }) => {
          reply.log.error({ err: error, service }, "upstream error")
          const timeout = (error as { code?: string }).code === "UND_ERR_HEADERS_TIMEOUT"
          reply
            .status(timeout ? 504 : 503)
            .send(new AppError(timeout ? "TIMEOUT" : "SERVICE_UNAVAILABLE", `${service} service is ${timeout ? "not responding" : "unavailable"}`).toBody())
        },
      },
    })
  }

  // Real-time channel (messages, notifications) served by the notification service.
  await app.register(proxy, { upstream: upstreamFor("notification"), prefix: "/socket.io", rewritePrefix: "/socket.io", websocket: true })

  return app
}
