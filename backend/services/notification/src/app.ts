import Fastify, { type FastifyServerOptions } from "fastify"
import { loggerOptions, ok, registerErrorHandler } from "@hustl/common"
import { prisma } from "@hustl/db"
import { conversationRoutes } from "./conversations"
import { notificationRoutes } from "./notifications"
import { attachRealtime, closeRealtime, realtimeHealth } from "./realtime"

export const SERVICE_NAME = "notification-service"

/** Builds the HTTP app with Socket.io attached to its server. Does not listen (tests use inject()). */
export async function buildApp(opts: { logger?: FastifyServerOptions["logger"] } = {}) {
  const app = Fastify({
    logger: opts.logger ?? loggerOptions(SERVICE_NAME),
    genReqId: (req) => (req.headers["x-request-id"] as string) ?? crypto.randomUUID(),
    trustProxy: true,
  })
  registerErrorHandler(app)

  app.get("/health", async (_req, reply) => {
    const checks: Record<string, string> = {}
    let healthy = true
    try {
      await prisma.$queryRaw`SELECT 1`
      checks.database = "ok"
    } catch {
      checks.database = "down"
      healthy = false
    }
    try {
      checks.realtime = await realtimeHealth()
    } catch (e) {
      checks.realtime = `down: ${(e as Error).message}`
    }
    return reply.status(healthy ? 200 : 503).send(ok({ service: SERVICE_NAME, status: healthy ? "ok" : "degraded", checks }))
  })

  await app.register(conversationRoutes)
  await app.register(notificationRoutes)

  attachRealtime(app.server)
  app.addHook("onClose", async () => {
    await closeRealtime()
  })
  return app
}
