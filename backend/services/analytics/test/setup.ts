// Must be the first import of every test file: points Prisma at the test DB.
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

const envFile = fileURLToPath(new URL("../../../.env", import.meta.url))
if (existsSync(envFile)) process.loadEnvFile(envFile)
if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is required for tests")
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
process.env.NODE_ENV = "test"
process.env.LOG_LEVEL = "silent"
delete process.env.KAFKA_BROKERS
