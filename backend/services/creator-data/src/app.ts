import Fastify, { type FastifyInstance } from "fastify"
import { registerErrorHandler } from "@hustl/common"
import { registerAdminRoutes, registerSocialRoutes } from "./routes"

export async function registerRoutes(app: FastifyInstance) {
  await registerSocialRoutes(app)
  await registerAdminRoutes(app)
}

/** App without listening — used by tests with `inject()`. */
export async function buildApp() {
  const app = Fastify({ logger: false })
  registerErrorHandler(app)
  await registerRoutes(app)
  await app.ready()
  return app
}
