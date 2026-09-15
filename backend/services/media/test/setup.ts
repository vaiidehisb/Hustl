// Must be the first import of every test file: points Prisma at the test DB and
// storage at a throwaway directory.
import { existsSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const envFile = fileURLToPath(new URL("../../../.env", import.meta.url))
if (existsSync(envFile)) process.loadEnvFile(envFile)
if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is required for tests")
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
process.env.NODE_ENV = "test"
process.env.LOG_LEVEL = "silent"
process.env.STORAGE_DRIVER = "local"
process.env.STORAGE_LOCAL_DIR = mkdtempSync(path.join(tmpdir(), "hustl-media-test-"))
for (const k of ["S3_BUCKET", "S3_REGION", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "MEDIA_PUBLIC_BASE_URL", "KAFKA_BROKERS"]) delete process.env[k]
