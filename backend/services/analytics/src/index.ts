// analytics-service (:4007) — brand, creator, deal and platform analytics
// computed from PostgreSQL. (ClickHouse is the documented target at scale.)

import { createLogger, createService, loadConfig, SERVICE_PORTS } from "@hustl/common"
import { registerRoutes } from "./app"

loadConfig({})

const log = createLogger("analytics-service")

createService({ name: "analytics-service", port: SERVICE_PORTS.analytics, routes: registerRoutes }).catch((err) => {
  log.error({ err }, "failed to start")
  process.exit(1)
})
