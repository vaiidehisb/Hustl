"use client"

// Small media uploader: POST /media/uploads → PUT the bytes → complete → read
// back the download URL. S3/R2 gives a presigned absolute URL; the local driver
// returns a relative path on the API, which we send through the BFF proxy.

import { browserApi, ApiError, isApiError } from "@/lib/api/browser"
import { GATEWAY_PROXY_BASE } from "@/lib/api/browser"
import type { MediaAssetDto, MediaKind } from "@hustl/contracts"
import { UPLOAD_POLICIES } from "@hustl/contracts"

export type UploadedMedia = {
  asset: MediaAssetDto
  /** Signed download URL from the media service. Relative for the local storage driver. */
  url: string
  /** True when the URL is an absolute http(s) URL that can be stored on the profile. */
  absolute: boolean
}

export class UploadError extends Error {}

export function checkFile(file: File, kind: MediaKind) {
  const policy = UPLOAD_POLICIES[kind]
  if (!policy.uploadable) throw new UploadError("This file type can't be uploaded here.")
  if (!policy.mimeTypes.includes(file.type)) throw new UploadError(`${file.type || "That file type"} isn't allowed here. Use ${policy.mimeTypes.join(", ")}.`)
  if (file.size > policy.maxBytes) throw new UploadError(`That file is ${Math.round(file.size / 1024 / 1024)}MB — the limit is ${Math.round(policy.maxBytes / 1024 / 1024)}MB.`)
}

export async function uploadMedia(file: File, kind: MediaKind): Promise<UploadedMedia> {
  checkFile(file, kind)

  const created = (await browserApi.media.createUpload({
    kind: kind as never,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  })) as unknown as { asset: MediaAssetDto; upload: { method: "PUT"; url: string; headers: Record<string, string>; driver: "s3" | "local" } }

  const { asset, upload } = created
  if (upload.driver === "local" || upload.url.startsWith("/")) {
    await browserApi.media.uploadContent(asset.id, file, file.type || "application/octet-stream")
  } else {
    const res = await fetch(upload.url, { method: upload.method, headers: upload.headers, body: file })
    if (!res.ok) throw new UploadError("The storage provider rejected the upload. Please try again.")
  }

  await browserApi.media.completeUpload(asset.id)
  const download = (await browserApi.media.get(asset.id)) as unknown as { asset: MediaAssetDto; download: { url: string } }
  const raw = download.download?.url ?? ""
  const absolute = /^https?:\/\//i.test(raw)
  return { asset: download.asset ?? asset, url: absolute ? raw : `${GATEWAY_PROXY_BASE}${raw}`, absolute }
}

export function uploadErrorMessage(err: unknown) {
  if (err instanceof UploadError) return err.message
  if (isApiError(err) || err instanceof ApiError) return (err as ApiError).message
  return "Upload failed. Please try again."
}
