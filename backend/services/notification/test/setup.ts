// Import first in every DB test: points Prisma at TEST_DATABASE_URL before @hustl/db loads.
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const envFile = fileURLToPath(new URL("../../../.env", import.meta.url))
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "")
  }
}
if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL must be set for notification-service tests")
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
process.env.NODE_ENV = "test"
delete process.env.REDIS_URL
delete process.env.SENDGRID_API_KEY
delete process.env.KAFKA_BROKERS
