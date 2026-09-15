// user-service — accounts, auth sessions, creator/brand profiles, verification, admin user management.
import { createService, startOutboxRelay } from "@hustl/common"
import { registerRoutes } from "./app"
import { config, SERVICE_NAME } from "./config"

const stopRelay = startOutboxRelay(SERVICE_NAME)

createService({
  name: SERVICE_NAME,
  port: config.PORT,
  routes: registerRoutes,
  onClose: () => stopRelay(),
}).catch((err) => {
  console.error(`${SERVICE_NAME} failed to start`, err)
  process.exit(1)
})
