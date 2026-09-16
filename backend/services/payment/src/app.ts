import { createBaseApp } from "./lib/app-base"
import { registerRoutes } from "./routes"

export const SERVICE_NAME = "payment-service"

/** Builds the Fastify app without listening (used by index.ts and tests via inject()). */
export async function buildApp(opts: { logger?: boolean } = {}) {
  const app = createBaseApp(SERVICE_NAME, opts)
  await registerRoutes(app)
  await app.ready()
  return app
}
