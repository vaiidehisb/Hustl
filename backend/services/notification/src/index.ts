// notification-service (:4006) — messaging, in-app notifications, email and the
// Socket.io real-time channel. See backend/API.md.
import { z } from "zod"
import { createLogger, loadConfig, SERVICE_PORTS, subscribe } from "@hustl/common"
import { prisma } from "@hustl/db"
import { buildApp, SERVICE_NAME } from "./app"
import { handleEvent, NOTIFICATION_TOPICS } from "./consumer"
import { initEmail } from "./email"

loadConfig({
  REDIS_URL: z.string().url().optional(),
  SENDGRID_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
})

async function main() {
  const app = await buildApp()
  initEmail(app.log)
  app.log.info({ adapter: process.env.REDIS_URL ? "redis" : "in-memory" }, "socket.io attached at /socket.io")

  const consumerLog = createLogger(`${SERVICE_NAME}:events`)
  const stopConsumer = subscribe(SERVICE_NAME, NOTIFICATION_TOPICS, async (event) => {
    await handleEvent(event, consumerLog)
  })

  let closing = false
  const shutdown = async () => {
    if (closing) return
    closing = true
    await stopConsumer()
    await app.close()
    await prisma.$disconnect()
    process.exit(0)
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)

  await app.listen({ port: Number(process.env.PORT ?? SERVICE_PORTS.notification), host: "0.0.0.0" })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
