import Fastify, { type FastifyInstance } from "fastify"
import { ZodError } from "zod"
import { prisma, Prisma } from "@hustl/db"
import { AppError, ok } from "./errors"
import { loggerOptions } from "./logger"

type ServiceOptions = {
  name: string
  port: number
  routes: (app: FastifyInstance) => Promise<void> | void
  /** Extra readiness checks (e.g. Elasticsearch) reported on /health. */
  checks?: Record<string, () => Promise<string>>
  onReady?: (app: FastifyInstance) => Promise<void> | void
  onClose?: () => Promise<void> | void
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) return reply.status(err.status).send(err.toBody())
    if (err instanceof ZodError)
      return reply.status(422).send(new AppError("VALIDATION_ERROR", "Invalid request", err.flatten()).toBody())
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") return reply.status(409).send(new AppError("CONFLICT", "A record with these values already exists", { fields: err.meta?.target }).toBody())
      if (err.code === "P2025") return reply.status(404).send(new AppError("NOT_FOUND", "Resource not found").toBody())
      if (err.code === "P2003") return reply.status(409).send(new AppError("CONFLICT", "Related record does not exist").toBody())
    }
    const status = (err as { statusCode?: number }).statusCode
    if (status === 429) return reply.status(429).send(new AppError("RATE_LIMITED", "Too many requests").toBody())
    if (status && status < 500) return reply.status(status).send(new AppError(status === 404 ? "NOT_FOUND" : "BAD_REQUEST", (err as Error).message).toBody())
    req.log.error({ err }, "unhandled error")
    return reply.status(500).send(new AppError("INTERNAL_ERROR", "Something went wrong").toBody())
  })
  app.setNotFoundHandler((req, reply) => reply.status(404).send(new AppError("NOT_FOUND", `Route ${req.method} ${req.url} not found`).toBody()))
}

export async function createService(opts: ServiceOptions) {
  const app = Fastify({
    logger: loggerOptions(opts.name),
    genReqId: (req) => (req.headers["x-request-id"] as string) ?? crypto.randomUUID(),
    trustProxy: true,
  })
  registerErrorHandler(app)

  app.get("/health", async (_req, reply) => {
    const results: Record<string, string> = {}
    let healthy = true
    try {
      await prisma.$queryRaw`SELECT 1`
      results.database = "ok"
    } catch {
      results.database = "down"
      healthy = false
    }
    for (const [name, check] of Object.entries(opts.checks ?? {})) {
      try {
        results[name] = await check()
      } catch (e) {
        results[name] = `down: ${(e as Error).message}`
      }
    }
    return reply.status(healthy ? 200 : 503).send(ok({ service: opts.name, status: healthy ? "ok" : "degraded", checks: results }))
  })

  await opts.routes(app)

  const shutdown = async () => {
    await app.close()
    await opts.onClose?.()
    await prisma.$disconnect()
    process.exit(0)
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)

  await app.listen({ port: Number(process.env.PORT ?? opts.port), host: "0.0.0.0" })
  await opts.onReady?.(app)
  return app
}
