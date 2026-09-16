import type { CreateUploadRequest, CreateUploadResponse, MediaAsset, MediaDownload } from "./types"
import { seg, type CallOptions, type Requester } from "./core"

const PDF_TIMEOUT = 30_000

export const mediaApi = (r: Requester) => ({
  /** POST /media/uploads — returns the asset + where to PUT the bytes. */
  createUpload: (body: CreateUploadRequest, o?: CallOptions) => r<CreateUploadResponse>("/media/uploads", { ...o, method: "POST", body }),
  /** PUT /media/uploads/:id/content — local storage driver only. */
  uploadContent: (id: string, content: Blob | ArrayBuffer | ReadableStream, contentType: string, o?: CallOptions) =>
    r<MediaAsset>(`/media/uploads/${seg(id)}/content`, { timeoutMs: 120_000, ...o, method: "PUT", body: content, headers: { "content-type": contentType, ...o?.headers } }),
  /** POST /media/uploads/:id/complete */
  completeUpload: (id: string, o?: CallOptions) => r<MediaAsset>(`/media/uploads/${seg(id)}/complete`, { ...o, method: "POST" }),
  /** GET /media/:id — signed download URL. */
  get: (id: string, o?: CallOptions) => r<MediaDownload>(`/media/${seg(id)}`, o),
  /** DELETE /media/:id */
  remove: (id: string, o?: CallOptions) => r<{ deleted: true }>(`/media/${seg(id)}`, { ...o, method: "DELETE" }),
  /** POST /media/contracts/:dealId/pdf — raw PDF Response (stream it). */
  contractPdf: (dealId: string, o?: CallOptions) => r.raw(`/media/contracts/${seg(dealId)}/pdf`, { timeoutMs: PDF_TIMEOUT, ...o, method: "POST" }),
  /** GET /media/media-kit/:creatorId — raw PDF Response. */
  mediaKit: (creatorId: string, o?: CallOptions) => r.raw(`/media/media-kit/${seg(creatorId)}`, { timeoutMs: PDF_TIMEOUT, ...o }),
  /** GET /media/reports/deals/:dealId — raw PDF Response. */
  dealReport: (dealId: string, o?: CallOptions) => r.raw(`/media/reports/deals/${seg(dealId)}`, { timeoutMs: PDF_TIMEOUT, ...o }),
})

/** Same-origin URLs for PDFs, served through the BFF proxy (for <a href> / window.open). */
export const mediaHref = {
  mediaKit: (creatorId: string) => `/api/gateway/media/media-kit/${seg(creatorId)}`,
  dealReport: (dealId: string) => `/api/gateway/media/reports/deals/${seg(dealId)}`,
}
