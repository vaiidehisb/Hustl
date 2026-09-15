import type { Brief, BriefMatch, SearchBriefsQuery, SearchCreatorsQuery, SearchMeta } from "./types"
import type { CallOptions, Requester } from "./core"

export type CreatorSearchHit = BriefMatch["creator"] & { location?: string; available?: boolean; score?: number } // TODO(contract)

export const searchApi = (r: Requester) => ({
  /** GET /search/creators (brand/admin) — `meta.engine` is elasticsearch|postgres. */
  creators: (query?: SearchCreatorsQuery, o?: CallOptions) => r.withMeta<CreatorSearchHit[], SearchMeta>("/search/creators", { ...o, query }),
  /** GET /search/briefs (authenticated) */
  briefs: (query?: SearchBriefsQuery, o?: CallOptions) => r.withMeta<Brief[], SearchMeta>("/search/briefs", { ...o, query }),
})
