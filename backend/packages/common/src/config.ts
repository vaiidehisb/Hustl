import { z } from "zod"

const base = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  INTERNAL_SERVICE_TOKEN: z.string().min(16, "INTERNAL_SERVICE_TOKEN must be at least 16 characters"),
  KAFKA_BROKERS: z.string().optional(),
})

/** Validates process.env once at boot; a misconfigured service refuses to start. */
export function loadConfig<T extends z.ZodRawShape>(extra: T) {
  const schema = base.extend(extra)
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n")
    console.error(`Invalid environment configuration:\n${issues}`)
    process.exit(1)
  }
  return parsed.data as z.infer<typeof schema>
}

export const SERVICE_PORTS = {
  gateway: 4000,
  user: 4001,
  deal: 4002,
  payment: 4003,
  creator: 4004,
  search: 4005,
  notification: 4006,
  analytics: 4007,
  media: 4008,
} as const

export const serviceUrl = (name: keyof typeof SERVICE_PORTS) =>
  process.env[`${name.toUpperCase()}_SERVICE_URL`] ?? `http://localhost:${SERVICE_PORTS[name]}`
