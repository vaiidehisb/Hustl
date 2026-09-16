import { createLogger, errors, loadConfig, SERVICE_PORTS, startOutboxRelay, subscribe, TOPICS } from "@hustl/common"
import { prisma } from "@hustl/db"
import { z } from "zod"
import { buildApp, CONSUMED_TOPICS, handleEvent, SERVICE_NAME } from "./app"
import { embedBrief } from "./services/briefs"

const config = loadConfig({
  PORT: z.coerce.number().optional(),
  AI_SERVICE_URL: z.string().url().optional(),
})

async function main() {
  const log = createLogger(SERVICE_NAME)
  if (!config.AI_SERVICE_URL) log.warn("AI_SERVICE_URL is not set — brief parsing, matching and application scoring will return 503")

  const app = await buildApp()
  const stopRelay = startOutboxRelay(SERVICE_NAME)
  const stopConsumer = subscribe(SERVICE_NAME, CONSUMED_TOPICS, handleEvent)
  // Retries brief embeddings until the AI backend accepts them (blocks only this consumer).
  const stopEmbeddings = subscribe(
    `${SERVICE_NAME}.brief-embeddings`,
    [TOPICS.BRIEF_PUBLISHED, TOPICS.BRIEF_UPDATED],
    async (event) => {
      const { briefId, status } = event.payload as { briefId: string; status?: string }
      if (status === "CLOSED") return
      if ((await embedBrief(briefId)) === "failed") throw errors.serviceUnavailable("AI service")
    },
    30_000,
  )

  const shutdown = async () => {
    stopRelay()
    await Promise.all([stopConsumer(), stopEmbeddings()])
    await app.close()
    await prisma.$disconnect()
    process.exit(0)
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)

  await app.listen({ port: config.PORT ?? SERVICE_PORTS.deal, host: "0.0.0.0" })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
