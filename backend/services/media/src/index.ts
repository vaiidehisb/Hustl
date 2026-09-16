// media-service (:4008) — uploads (S3/R2 presigned or local disk), signed
// downloads and PDF rendering (signed contracts, media kits, deal reports).

import { z } from "zod"
import { createLogger, createService, loadConfig, SERVICE_PORTS, startOutboxRelay } from "@hustl/common"
import { registerRoutes } from "./app"
import { storageStatus } from "./storage"

loadConfig({
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional().or(z.literal("")),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  MEDIA_PUBLIC_BASE_URL: z.string().url().optional(),
})

const log = createLogger("media-service")
const stops: (() => unknown)[] = []

createService({
  name: "media-service",
  port: SERVICE_PORTS.media,
  routes: registerRoutes,
  checks: {
    storage: async () => {
      const s = storageStatus()
      return s.configured ? s.driver : `${s.driver} not configured (missing ${s.missingEnv.join(", ")})`
    },
  },
  onReady: () => {
    stops.push(startOutboxRelay("media-service"))
    const s = storageStatus()
    if (!s.configured) log.warn({ missingEnv: s.missingEnv }, "S3 storage not configured — media endpoints return 503")
    if (s.driver === "local" && process.env.NODE_ENV === "production") log.warn("local storage driver in production — files live on this instance's disk")
  },
  onClose: async () => {
    for (const stop of stops) await stop()
  },
}).catch((err) => {
  log.error({ err }, "failed to start")
  process.exit(1)
})
