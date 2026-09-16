// API Gateway entry point — see app.ts for routing, auth pre-checks and rate limits.
import { loadConfig, SERVICE_PORTS } from "@hustl/common"
import { z } from "zod"
import { buildGateway } from "./app"

const config = loadConfig({
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
  /**
   * "false" (default: client IP = socket address), "true", a hop count ("1" behind one load balancer)
   * or a comma-separated list of trusted proxy IPs/CIDRs. Over-trusting lets clients spoof IPs past rate limits.
   */
  TRUST_PROXY: z.string().default("false"),
})

function parseTrustProxy(value: string): boolean | number | string {
  const v = value.trim().toLowerCase()
  if (v === "true") return true
  if (v === "" || v === "false") return false
  if (/^\d+$/.test(v)) return Number(v)
  return value
}

async function main() {
  const app = await buildGateway({
    corsOrigins: config.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
    rateLimitPerMinute: config.RATE_LIMIT_PER_MINUTE,
    authRateLimitPerMinute: config.AUTH_RATE_LIMIT_PER_MINUTE,
    trustProxy: parseTrustProxy(config.TRUST_PROXY),
    logger: true,
  })

  const shutdown = async () => {
    await app.close()
    process.exit(0)
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)

  await app.listen({ port: Number(process.env.PORT ?? SERVICE_PORTS.gateway), host: "0.0.0.0" })
}

main().catch((err) => {
  console.error("gateway failed to start", err)
  process.exit(1)
})
