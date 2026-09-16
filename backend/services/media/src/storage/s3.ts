// S3 / Cloudflare R2 storage with presigned PUT (10 min) and GET (5 min) URLs.

import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { DOWNLOAD_TTL_SECONDS, UPLOAD_TTL_SECONDS } from "../signing"
import type { StorageDriver } from "./types"

export type S3Config = { bucket: string; region: string; endpoint?: string; accessKeyId: string; secretAccessKey: string }

const contentDisposition = (fileName: string, mimeType: string) => {
  const inline = /^(image|video)\//.test(mimeType) || mimeType === "application/pdf"
  return `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(fileName)}`
}

export function createS3Driver(cfg: S3Config): StorageDriver {
  const client = new S3Client({
    region: cfg.region,
    ...(cfg.endpoint && { endpoint: cfg.endpoint, forcePathStyle: true }),
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  })

  return {
    name: "s3",
    bucket: cfg.bucket,

    async createUpload(asset) {
      const url = await getSignedUrl(
        client,
        new PutObjectCommand({ Bucket: cfg.bucket, Key: asset.storageKey, ContentType: asset.mimeType, ...(asset.sizeBytes && { ContentLength: asset.sizeBytes }) }),
        { expiresIn: UPLOAD_TTL_SECONDS },
      )
      return { method: "PUT", url, headers: { "content-type": asset.mimeType }, expiresAt: new Date(Date.now() + UPLOAD_TTL_SECONDS * 1000).toISOString(), driver: "s3" }
    },

    async stat(key) {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }))
        return { size: head.ContentLength ?? 0 }
      } catch (err) {
        const e = err as { name?: string; $metadata?: { httpStatusCode?: number } }
        if (e.name === "NotFound" || e.$metadata?.httpStatusCode === 404) return null
        throw err
      }
    },

    async downloadUrl(asset) {
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: cfg.bucket,
          Key: asset.storageKey,
          ResponseContentType: asset.mimeType,
          ResponseContentDisposition: contentDisposition(asset.fileName, asset.mimeType),
        }),
        { expiresIn: DOWNLOAD_TTL_SECONDS },
      )
      return { url, expiresAt: new Date(Date.now() + DOWNLOAD_TTL_SECONDS * 1000).toISOString() }
    },

    async put(key, body, mimeType) {
      await client.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: body, ContentType: mimeType, ContentLength: body.length }))
    },

    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }))
    },
  }
}
