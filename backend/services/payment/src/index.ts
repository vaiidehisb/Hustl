import { createLogger, loadConfig, SERVICE_PORTS, startOutboxRelay } from "@hustl/common"
import { prisma } from "@hustl/db"
import { z } from "zod"
import { buildApp, SERVICE_NAME } from "./app"
import { assertProviderAllowed, providerNameFromEnv } from "./providers"

const config = loadConfig({
  PORT: z.coerce.number().optional(),
  PAYMENTS_PROVIDER: z.string().regex(/^(stripe|razorpay|test)$/i, "PAYMENTS_PROVIDER must be stripe, razorpay or test"),
  PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
})

async function main() {
  const log = createLogger(SERVICE_NAME)
  const provider = providerNameFromEnv(config.PAYMENTS_PROVIDER)
  try {
    assertProviderAllowed(provider, config.NODE_ENV)
  } catch (err) {
    log.fatal((err as Error).message)
    process.exit(1)
  }
  if (provider !== "TEST") {
    const needed = provider === "STRIPE" ? ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] : ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"]
    const missing = needed.filter((n) => !process.env[n])
    // Not fatal: endpoints answer 503 INTEGRATION_UNAVAILABLE listing these until configured.
    if (missing.length) log.warn({ provider, missing }, "payment provider credentials missing")
  }

  const app = await buildApp()
  const stopRelay = startOutboxRelay(SERVICE_NAME)

  const shutdown = async () => {
    stopRelay()
    await app.close()
    await prisma.$disconnect()
    process.exit(0)
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)

  await app.listen({ port: config.PORT ?? SERVICE_PORTS.payment, host: "0.0.0.0" })
  log.info({ provider }, "payment-service ready")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
