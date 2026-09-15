import type { Brief, BriefFit, BriefInput, BriefMatch, OpenBriefsQuery, ParsedBrief } from "./types"
import { seg, type CallOptions, type Requester } from "./core"

export const briefsApi = (r: Requester) => ({
  /** POST /briefs — creates a draft. */
  create: (body: BriefInput, o?: CallOptions) => r<Brief>("/briefs", { ...o, method: "POST", body }),
  /** PATCH /briefs/:id */
  update: (id: string, body: Partial<BriefInput>, o?: CallOptions) => r<Brief>(`/briefs/${seg(id)}`, { ...o, method: "PATCH", body }),
  /** POST /briefs/:id/publish */
  publish: (id: string, o?: CallOptions) => r<Brief>(`/briefs/${seg(id)}/publish`, { ...o, method: "POST" }),
  /** POST /briefs/:id/close */
  close: (id: string, o?: CallOptions) => r<Brief>(`/briefs/${seg(id)}/close`, { ...o, method: "POST" }),
  /** GET /briefs/mine (brand) */
  mine: (query?: { status?: string; page?: number }, o?: CallOptions) => r.withMeta<Brief[]>("/briefs/mine", { ...o, query }),
  /** GET /briefs/:id */
  get: (id: string, o?: CallOptions) => r<Brief>(`/briefs/${seg(id)}`, o),
  /** DELETE /briefs/:id — drafts only (soft delete). */
  remove: (id: string, o?: CallOptions) => r<{ deleted: true }>(`/briefs/${seg(id)}`, { ...o, method: "DELETE" }),
  /** POST /briefs/parse — AI brief parser. */
  parse: (text: string, o?: CallOptions) => r<ParsedBrief>("/briefs/parse", { timeoutMs: 30_000, ...o, method: "POST", body: { text } }),
  /** GET /briefs/:id/matches (brand owner) — AI ranked creators. */
  matches: (id: string, o?: CallOptions) => r<BriefMatch[]>(`/briefs/${seg(id)}/matches`, { timeoutMs: 30_000, ...o }),
  /** GET /briefs/open — marketplace of published briefs. */
  open: (query?: OpenBriefsQuery, o?: CallOptions) => r.withMeta<Brief[]>("/briefs/open", { ...o, query }),
  /** GET /briefs/:id/fit (creator) — application scoring preview. */
  fit: (id: string, o?: CallOptions) => r<BriefFit>(`/briefs/${seg(id)}/fit`, o),
})
