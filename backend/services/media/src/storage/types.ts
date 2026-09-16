import type { Readable } from "node:stream"
import type { DownloadUrl, UploadInstructions } from "@hustl/contracts"

export type StoredAsset = { id: string; storageKey: string; fileName: string; mimeType: string; sizeBytes: number | null }

export interface StorageDriver {
  readonly name: "s3" | "local"
  readonly bucket: string
  /** Instructions for the client to upload the object bytes. */
  createUpload(asset: StoredAsset): Promise<UploadInstructions>
  /** Object size, or null when the object doesn't exist. */
  stat(key: string): Promise<{ size: number } | null>
  /** Short-lived download URL. */
  downloadUrl(asset: StoredAsset): Promise<DownloadUrl>
  put(key: string, body: Buffer, mimeType: string): Promise<void>
  remove(key: string): Promise<void>
}

export interface LocalStorageDriver extends StorageDriver {
  readonly name: "local"
  /** Streams the body to disk; rejects (and writes nothing) when it exceeds maxBytes. */
  write(key: string, body: Readable, maxBytes: number): Promise<number>
  read(key: string): Readable
}
