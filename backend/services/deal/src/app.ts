import type { EventEnvelope } from "@hustl/common"
import { TOPICS } from "@hustl/common"
import { createBaseApp } from "./lib/app-base"
import { briefRoutes } from "./routes/briefs"
import { applicationRoutes, dealRoutes, internalRoutes } from "./routes/deals"
import { onPaymentFunded, onMilestoneReleased, onPaymentRefunded } from "./services/deals"
import { onDisputeResolved } from "./services/disputes"

export const SERVICE_NAME = "deal-service"

/** Builds the Fastify app without listening (used by index.ts and tests via inject()). */
export async function buildApp(opts: { logger?: boolean } = {}) {
  const app = createBaseApp(SERVICE_NAME, opts)
  await briefRoutes(app)
  await applicationRoutes(app)
  await dealRoutes(app)
  await internalRoutes(app)
  await app.ready()
  return app
}

export const CONSUMED_TOPICS = [TOPICS.PAYMENT_FUNDED, TOPICS.PAYMENT_RELEASED, TOPICS.PAYMENT_REFUNDED, TOPICS.DISPUTE_RESOLVED]

/** Dispatches bus events to idempotent handlers. */
export async function handleEvent(event: EventEnvelope) {
  switch (event.topic) {
    case TOPICS.PAYMENT_FUNDED:
      return onPaymentFunded(event)
    case TOPICS.PAYMENT_RELEASED:
      return onMilestoneReleased(event)
    case TOPICS.PAYMENT_REFUNDED:
      return onPaymentRefunded(event)
    case TOPICS.DISPUTE_RESOLVED:
      return onDisputeResolved(event)
  }
}
