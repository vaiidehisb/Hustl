import Fastify, { type FastifyInstance } from "fastify"
import { AppError, loggerOptions, ok, registerErrorHandler } from "@hustl/common"
import { prisma } from "@hustl/db"

export const WEBHOOK_PREFIX = "/payments/webhooks/"

/** Fastify instance with the shared error envelope, /health and a JSON parser that keeps webhook bodies raw. */
export function createBaseApp(name: string, opts: { logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({
    logger: opts.logger === false ? false : loggerOptions(name),
    genReqId: (req) => (req.headers["x-request-id"] as string) ?? crypto.randomUUID(),
    trustProxy: true,
    bodyLimit: 1_048_576,
  })
  registerErrorHandler(app)

  app.removeContentTypeParser("application/json")
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
    const buf = body as Buffer
    // Signature verification needs the exact bytes the provider signed.
    if (req.url.startsWith(WEBHOOK_PREFIX)) return done(null, buf)
    if (buf.length === 0) return done(null, undefined)
    try {
      done(null, JSON.parse(buf.toString("utf8")))
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
