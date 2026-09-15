// creator-data-service (:4004) — social accounts (Phyllo + self-reported),
// metric normalisation, AI scoring/fraud orchestration, fraud review.

import { z } from "zod"
import { createLogger, createService, loadConfig, SERVICE_PORTS, startOutboxRelay, subscribe } from "@hustl/common"
import { registerRoutes } from "./app"
import { phylloStatus } from "./integrations/phyllo"
import { handleCreatorEvent, ORCHESTRATION_TOPICS } from "./orchestration"
import { startScheduler } from "./sync"

loadConfig({
  AI_SERVICE_URL: z.string().url().optional(),
  PHYLLO_CLIENT_ID: z.string().optional(),
  PHYLLO_CLIENT_SECRET: z.string().optional(),
  PHYLLO_ENVIRONMENT: z.enum(["sandbox", "staging", "production"]).optional(),
  PHYLLO_WEBHOOK_SECRET: z.string().optional(),
})

const log = createLogger("creator-data-service")
const stops: (() => unknown)[] = []

createService({
  name: "creator-data-service",
  port: SERVICE_PORTS.creator,
  routes: registerRoutes,
  checks: {
    phyllo: async () => (phylloStatus().configured ? "configured" : "not configured"),
    ai: async () => (process.env.AI_SERVICE_URL ? "configured" : "not configured"),
  },
  onReady: () => {
    stops.push(startOutboxRelay("creator-data-service"))
    stops.push(subscribe("creator-data-service", ORCHESTRATION_TOPICS, handleCreatorEvent))
    stops.push(startScheduler())
    if (!phylloStatus().configured) log.warn({ missingEnv: phylloStatus().missingEnv }, "Phyllo not configured — Phyllo endpoints return 503")
  },
  onClose: async () => {
    for (const stop of stops) await stop()
  },
}).catch((err) => {
  log.error({ err }, "failed to start")
  process.exit(1)
})
