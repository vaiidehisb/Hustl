// Must be the first import of every DB-backed test: points Prisma at TEST_DATABASE_URL.
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

const envFile = fileURLToPath(new URL("../../../.env", import.meta.url))
if (existsSync(envFile)) process.loadEnvFile(envFile)
if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL must be set for integration tests")

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
process.env.NODE_ENV = "test"
process.env.LOG_LEVEL = "silent"
process.env.PAYMENTS_PROVIDER = "test"
process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_vitest_razorpay_secret"
process.env.JWT_SECRET ??= "vitest-jwt-secret-vitest-jwt-secret-000000"
process.env.INTERNAL_SERVICE_TOKEN ??= "vitest-internal-token-0000"
