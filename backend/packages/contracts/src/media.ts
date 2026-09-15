// media-service contracts (see backend/API.md → media-service).
import { z } from "zod"

export const MEDIA_KINDS = ["AVATAR", "LOGO", "PORTFOLIO", "DELIVERABLE", "CONTRACT_PDF", "MEDIA_KIT", "REPORT", "DISPUTE_EVIDENCE"] as const
export type MediaKind = (typeof MEDIA_KINDS)[number]
export type MediaStatus = "PENDING_UPLOAD" | "READY" | "FAILED"

const IMAGES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const
const VIDEOS = ["video/mp4", "video/quicktime", "video/webm"] as const
const PDF = ["application/pdf"] as const
const MB = 1024 * 1024

export type UploadPolicy = { uploadable: boolean; mimeTypes: readonly string[]; maxBytes: number; requiresDeal: boolean }

/** Per-kind allow-list. Generated kinds (contract PDFs, reports) are not user-uploadable. */
export const UPLOAD_POLICIES: Record<MediaKind, UploadPolicy> = {
  AVATAR: { uploadable: true, mimeTypes: IMAGES, maxBytes: 5 * MB, requiresDeal: false },
  LOGO: { uploadable: true, mimeTypes: IMAGES, maxBytes: 5 * MB, requiresDeal: false },
  PORTFOLIO: { uploadable: true, mimeTypes: [...IMAGES, ...VIDEOS, ...PDF], maxBytes: 200 * MB, requiresDeal: false },
  DELIVERABLE: { uploadable: true, mimeTypes: [...IMAGES, ...VIDEOS, ...PDF], maxBytes: 500 * MB, requiresDeal: true },
  CONTRACT_PDF: { uploadable: false, mimeTypes: PDF, maxBytes: 20 * MB, requiresDeal: true },
  MEDIA_KIT: { uploadable: true, mimeTypes: PDF, maxBytes: 20 * MB, requiresDeal: false },
  REPORT: { uploadable: false, mimeTypes: PDF, maxBytes: 20 * MB, requiresDeal: true },
  DISPUTE_EVIDENCE: { uploadable: true, mimeTypes: [...IMAGES, ...VIDEOS, ...PDF], maxBytes: 100 * MB, requiresDeal: true },
}

export const createUploadRequest = z.object({
  kind: z.enum(MEDIA_KINDS),
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((n) => !/[\\/]/.test(n) && ![...n].some((c) => c.charCodeAt(0) < 32), "File name must not contain path separators or control characters"),
  mimeType: z.string().trim().toLowerCase().min(3).max(100),
  sizeBytes: z.number().int().positive(),
  dealId: z.string().uuid().optional(),
})
export type CreateUploadRequest = z.infer<typeof createUploadRequest>

export const mediaIdParams = z.object({ id: z.string().uuid() })
export const signedFileQuery = z.object({ exp: z.coerce.number().int().positive(), sig: z.string().min(16).max(128) })

export type MediaAssetDto = {
  id: string
  ownerId: string
  kind: MediaKind
  status: MediaStatus
  fileName: string
  mimeType: string
  sizeBytes: number | null
  dealId: string | null
  createdAt: string
  readyAt: string | null
}

/**
 * `url` is absolute for S3/R2. For the local driver it is a path on the API
 * (`/media/uploads/:id/content`), called through the gateway with the user's token.
 */
export type UploadInstructions = { method: "PUT"; url: string; headers: Record<string, string>; expiresAt: string; driver: "s3" | "local" }

export type CreateUploadResponse = { asset: MediaAssetDto; upload: UploadInstructions }

export type DownloadUrl = { url: string; expiresAt: string }

export type MediaAssetWithDownload = { asset: MediaAssetDto; download: DownloadUrl }
