// search-service (:4005) — creator and brief search over Elasticsearch, with a
// PostgreSQL engine when ELASTICSEARCH_URL is unset.

import { z } from "zod"
import { createLogger, createService, loadConfig, SERVICE_PORTS, subscribe } from "@hustl/common"
import { registerRoutes } from "./app"
import { selectEngine } from "./engines"
import { createIndexHandler, INDEXER_TOPICS } from "./indexer"

loadConfig({
  ELASTICSEARCH_URL: z.string().url().optional(),
  ELASTICSEARCH_API_KEY: z.string().optional(),
  ELASTICSEARCH_USERNAME: z.string().optional(),
  ELASTICSEARCH_PASSWORD: z.string().optional(),
  ELASTICSEARCH_INDEX_PREFIX: z.string().regex(/^[a-z0-9_-]+$/).optional(),
})

const log = createLogger("search-service")
const engine = selectEngine()
const stops: (() => unknown)[] = []

createService({
  name: "search-service",
  port: SERVICE_PORTS.search,
  routes: registerRoutes(engine),
  checks: { elasticsearch: () => engine.health(), engine: async () => engine.name },
  onReady: () => {
    log.info({ engine: engine.name }, "search engine selected")
    // Postgres queries live tables; only Elasticsearch needs an indexer.
    if (engine.name === "elasticsearch") stops.push(subscribe("search-service", INDEXER_TOPICS, createIndexHandler(engine)))
  },
  onClose: async () => {
    for (const stop of stops) await stop()
    await engine.close?.()
  },
}).catch((err) => {
  log.error({ err }, "failed to start")
  process.exit(1)
})
