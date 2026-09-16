import Fastify, { type FastifyInstance } from "fastify"
import { loggerOptions, registerErrorHandler } from "@hustl/common"
import { SERVICE_NAME } from "./config"
import { adminRoutes } from "./routes/admin.routes"
import { authRoutes } from "./routes/auth.routes"
import { internalRoutes } from "./routes/internal.routes"
import { profileRoutes } from "./routes/profiles.routes"
import { usersRoutes } from "./routes/users.routes"
import { verificationRoutes } from "./routes/verifications.routes"

/** Registers every user-service route. Used by both `createService` (index.ts) and `buildApp` (tests). */
export async function registerRoutes(app: FastifyInstance) {
  await app.register(authRoutes)
  await app.register(usersRoutes)
  await app.register(profileRoutes)
  await app.register(verificationRoutes)
  await app.register(adminRoutes)
  await app.register(internalRoutes)
}

/** A ready Fastify instance that doesn't listen — for `app.inject()` in tests. */
export async function buildApp(opts: { logger?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ? loggerOptions(SERVICE_NAME) : false, trustProxy: true })
  registerErrorHandler(app)
  await registerRoutes(app)
  await app.ready()
  return app
}
