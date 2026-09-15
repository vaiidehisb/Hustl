import Fastify, { type FastifyInstance } from "fastify"
import { AppError, loggerOptions, ok, registerErrorHandler } from "@hustl/common"
import { prisma } from "@hustl/db"

/** Fastify instance with the shared error envelope, /health and a JSON parser tolerant of empty bodies. */
export function createBaseApp(name: string, opts: { logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({
    logger: opts.logger === false ? false : loggerOptions(name),
    genReqId: (req) => (req.headers["x-request-id"] as string) ?? crypto.randomUUID(),
    trustProxy: true,
  })
  registerErrorHandler(app)

  // serviceClient sends content-type: application/json even for body-less POSTs.
  app.removeContentTypeParser("application/json")
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    const text = body as string
    if (!text.length) return done(null, undefined)
    try {
      done(null, JSON.parse(text))
    } catch {
      done(new AppError("BAD_REQUEST", "Malformed JSON body"), undefined)
    }
  })

  app.get("/health", async (_req, reply) => {
    let database = "ok"
    try {
      await prisma.$queryRaw`SELECT 1`
    } catch {
      database = "down"
    }
    const healthy = database === "ok"
    return reply.status(healthy ? 200 : 503).send(ok({ service: name, status: healthy ? "ok" : "degraded", checks: { database } }))
  })
  return app
}
