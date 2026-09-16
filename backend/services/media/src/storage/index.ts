import { errors } from "@hustl/common"
import { createLocalDriver } from "./local"
import { createS3Driver } from "./s3"
import type { LocalStorageDriver, StorageDriver } from "./types"

export type { LocalStorageDriver, StorageDriver } from "./types"

const S3_REQUIRED = ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const

let cached: { signature: string; driver: StorageDriver } | undefined

export function storageStatus() {
  const driver = (process.env.STORAGE_DRIVER ?? "local").toLowerCase()
  if (driver === "s3") {
    const missingEnv = S3_REQUIRED.filter((k) => !process.env[k])
    return { driver: "s3" as const, configured: missingEnv.length === 0, missingEnv }
  }
  return { driver: "local" as const, configured: true, missingEnv: [] as string[] }
}

/** Resolves the configured driver. `STORAGE_DRIVER=s3` with missing vars → 503. */
export function getStorage(): StorageDriver {
  const status = storageStatus()
  if (!status.configured) throw errors.integrationUnavailable("S3 storage", status.missingEnv)
  const e = process.env
  const signature =
    status.driver === "s3" ? ["s3", e.S3_BUCKET, e.S3_REGION, e.S3_ENDPOINT, e.S3_ACCESS_KEY_ID].join("|") : `local|${e.STORAGE_LOCAL_DIR ?? ""}`
  if (cached?.signature === signature) return cached.driver
  const driver =
    status.driver === "s3"
      ? createS3Driver({ bucket: e.S3_BUCKET!, region: e.S3_REGION!, endpoint: e.S3_ENDPOINT || undefined, accessKeyId: e.S3_ACCESS_KEY_ID!, secretAccessKey: e.S3_SECRET_ACCESS_KEY! })
      : createLocalDriver(e.STORAGE_LOCAL_DIR ?? ".local/storage")
  cached = { signature, driver }
  return driver
}

export const isLocal = (d: StorageDriver): d is LocalStorageDriver => d.name === "local"
