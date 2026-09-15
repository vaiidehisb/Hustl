import { loadConfig } from "@hustl/common"
import { z } from "zod"

/** Validated at boot; a misconfigured user-service refuses to start. */
export const config = loadConfig({
  PORT: z.coerce.number().int().positive().default(4001),
  /** OAuth client id(s) of the web/mobile apps, comma-separated. Google sign-in returns 503 when unset. */
  GOOGLE_CLIENT_ID: z.string().optional(),
})

export const SERVICE_NAME = "user-service"
export const BCRYPT_COST = 12
export const REFRESH_TOKEN_BYTES = 48
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** Read at call time so the integration can be enabled without code changes (and toggled in tests). */
export const googleClientIds = () =>
  (process.env.GOOGLE_CLIENT_ID ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
