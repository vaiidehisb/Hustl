"use client"
// Deliverable uploads: POST /media/uploads → PUT the bytes → POST …/complete.
// Local-driver uploads go back through the BFF proxy (the gateway attaches the
// session token); S3/R2 presigned URLs are absolute and must NOT get our cookie.
import type { CreateUploadResponse, MediaAssetDto } from "@hustl/contracts"
import { UPLOAD_POLICIES } from "@hustl/contracts"
import { browserFetch, GATEWAY_PROXY_BASE } from "@/lib/api/browser"
import { ApiError } from "@/lib/api/errors"

export type UploadProgress = "creating" | "uploading" | "finalising"

/** Client-side guard mirroring the service's per-kind allow-list, for a fast error. */
export function validateDeliverable(file: File): string | null {
  const policy = UPLOAD_POLICIES.DELIVERABLE
  const mime = file.type.toLowerCase()
  if (!policy.mimeTypes.includes(mime)) return `${file.type || "That file type"} isn't allowed. Upload an image, video or PDF.`
  if (file.size > policy.maxBytes) return `File is too large — the limit is ${Math.round(policy.maxBytes / (1024 * 1024))}MB.`
  return null
}

/** Uploads a deliverable and returns the READY asset. Throws ApiError on failure. */
export async function uploadDeliverable(file: File, dealId: string, onProgress?: (p: UploadProgress) => void): Promise<MediaAssetDto> {
  onProgress?.("creating")
  const { asset, upload } = await browserFetch<CreateUploadResponse>("/media/uploads", {
    method: "POST",
    body: { kind: "DELIVERABLE", fileName: file.name, mimeType: file.type.toLowerCase(), sizeBytes: file.size, dealId },
  })

  onProgress?.("uploading")
  const isLocal = upload.driver === "local" || upload.url.startsWith("/")
  const url = isLocal ? `${GATEWAY_PROXY_BASE}${upload.url.startsWith("/") ? upload.url : `/${upload.url}`}` : upload.url
  const res = await fetch(url, {
    method: upload.method,
    headers: { ...upload.headers, "content-type": file.type },
    body: file,
    ...(isLocal ? { credentials: "same-origin" as const } : {}),
  })
  if (!res.ok) throw new ApiError(res.status, res.status >= 500 ? "SERVICE_UNAVAILABLE" : "BAD_REQUEST", "The file couldn't be uploaded. Please try again.")

  onProgress?.("finalising")
  return browserFetch<MediaAssetDto>(`/media/uploads/${encodeURIComponent(asset.id)}/complete`, { method: "POST" })
}
