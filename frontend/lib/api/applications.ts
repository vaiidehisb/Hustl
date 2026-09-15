import type { Application, ApplicationStatus, CreateApplicationRequest } from "./types"
import { seg, type CallOptions, type Requester } from "./core"

export const applicationsApi = (r: Requester) => ({
  /** POST /briefs/:id/applications (creator) */
  create: (briefId: string, body: CreateApplicationRequest, o?: CallOptions) =>
    r<Application>(`/briefs/${seg(briefId)}/applications`, { timeoutMs: 30_000, ...o, method: "POST", body }),
  /** GET /briefs/:id/applications (brand owner) */
  forBrief: (briefId: string, query?: { status?: ApplicationStatus; page?: number }, o?: CallOptions) =>
    r.withMeta<Application[]>(`/briefs/${seg(briefId)}/applications`, { ...o, query }),
  /** GET /applications/mine (creator) */
  mine: (query?: { status?: ApplicationStatus; page?: number }, o?: CallOptions) => r.withMeta<Application[]>("/applications/mine", { ...o, query }),
  /** POST /applications/:id/withdraw */
  withdraw: (id: string, o?: CallOptions) => r<Application>(`/applications/${seg(id)}/withdraw`, { ...o, method: "POST" }),
  /** PATCH /applications/:id/status (brand) */
  setStatus: (id: string, status: Extract<ApplicationStatus, "SHORTLISTED" | "REJECTED">, o?: CallOptions) =>
    r<Application>(`/applications/${seg(id)}/status`, { ...o, method: "PATCH", body: { status } }),
})
