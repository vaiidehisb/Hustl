// API Gateway — the only backend entry point for clients.
// Responsibilities: routing, JWT pre-verification, rate limiting, CORS,
// request ids, blocking internal routes. Services still authorise every call.
// (Kong is the documented production gateway; this service implements the
// same routing contract and is what docker-compose runs.)

import Fastify from "fastify"
import cors from "@fastify/cors"
import helmet from "@fastify/helmet"
import rateLimit from "@fastify/rate-limit"
import proxy from "@fastify/http-proxy"
import { AppError, loadConfig, loggerOptions, ok, registerErrorHandler, serviceUrl, SERVICE_PORTS, verifyAccessToken } from "@hustl/common"
import { z } from "zod"

const config = loadConfig({
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().default(300),
})

type Service = keyof typeof SERVICE_PORTS

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

async function main() {
  const app = Fastify({ logger: loggerOptions("gateway"), trustProxy: true, genReqId: () => crypto.randomUUID() })
  registerErrorHandler(app)

  await app.register(helmet, { global: true })
  await app.register(cors, { origin: config.CORS_ORIGINS.split(","), credentials: true })
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_PER_MINUTE,
    timeWindow: "1 minute",
    keyGenerator: (req) => (req.headers.authorization ? `u:${req.headers.authorization.slice(-24)}` : `ip:${req.ip}`),
    errorResponseBuilder: () => new AppError("RATE_LIMITED", "Too many requests — slow down and retry shortly").toBody(),
  })

  app.addHook("onRequest", async (req) => {
    const path = req.url.split("?")[0]
    // Internal and AI routes are never reachable from outside.
    if (path.startsWith("/internal") || path.includes("/internal/") || path.startsWith("/ai")) throw new AppError("NOT_FOUND", "Route not found")
    // Reject bad/expired tokens early; services re-verify and authorise.
    const auth = req.headers.authorization
    if (auth?.startsWith("Bearer ")) verifyAccessToken(auth.slice(7))
    req.headers["x-request-id"] = req.id
  })

  // Stricter limit on credential endpoints.
  app.register(async (scope) => {
    await scope.register(rateLimit, { max: 20, timeWindow: "1 minute", keyGenerator: (req) => `auth:${req.ip}` })
  })

  app.get("/health", async () => {
    const services = await Promise.all(
      (Object.keys(SERVICE_PORTS) as Service[])
        .filter((s) => s !== "gateway")
        .map(async (s) => {
          try {
            const res = await fetch(`${serviceUrl(s)}/health`, { signal: AbortSignal.timeout(2000) })
            return [s, res.ok ? "ok" : `degraded (${res.status})`] as const
          } catch {
            return [s, "down"] as const
          }
        }),
    )
    return ok({ service: "gateway", services: Object.fromEntries(services) })
  })

  for (const [prefix, service] of ROUTES) {
    await app.register(proxy, {
      upstream: serviceUrl(service),
      prefix,
      rewritePrefix: prefix,
      http2: false,
      replyOptions: {
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
  await app.register(proxy, { upstream: serviceUrl("notification"), prefix: "/socket.io", rewritePrefix: "/socket.io", websocket: true })

  await app.listen({ port: Number(process.env.PORT ?? SERVICE_PORTS.gateway), host: "0.0.0.0" })
}

main()
