// Must be the first import of every DB-backed test file: points Prisma at the test database
// before @hustl/db constructs its client.
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

const envFile = fileURLToPath(new URL("../../../.env", import.meta.url))
if (existsSync(envFile)) process.loadEnvFile(envFile)

if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL must be set to run user-service tests")
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
