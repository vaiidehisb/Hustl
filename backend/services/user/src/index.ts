// user-service — accounts, auth sessions, creator/brand profiles, verification, admin user management.
import { createService, startOutboxRelay, subscribe } from "@hustl/common"
import { registerRoutes } from "./app"
import { config, SERVICE_NAME } from "./config"
import { consumeSubscriptionEvent, ENTITLEMENT_TOPICS } from "./services/entitlements"

const stopRelay = startOutboxRelay(SERVICE_NAME)
// Subscription entitlements (brand plan, paid creator badge) are applied here —
// payment-service never writes profile tables.
const stopEntitlements = subscribe(SERVICE_NAME, ENTITLEMENT_TOPICS, consumeSubscriptionEvent)

createService({
  name: SERVICE_NAME,
  port: config.PORT,
  routes: registerRoutes,
  onClose: async () => {
    await stopEntitlements()
    stopRelay()
  },
}).catch((err) => {
  console.error(`${SERVICE_NAME} failed to start`, err)
  process.exit(1)
})
