import type { BriefSearchResult, CreatorSearchResult, SearchBriefsQuery, SearchCreatorsQuery, SearchMeta } from "./types"
import type { CallOptions, Requester } from "./core"

export const searchApi = (r: Requester) => ({
  /** GET /search/creators (brand/admin) — `meta.engine` is elasticsearch|postgres. */
  creators: (query?: SearchCreatorsQuery, o?: CallOptions) => r.withMeta<CreatorSearchResult[], SearchMeta>("/search/creators", { ...o, query }),
  /** GET /search/briefs (authenticated) */
  briefs: (query?: SearchBriefsQuery, o?: CallOptions) => r.withMeta<BriefSearchResult[], SearchMeta>("/search/briefs", { ...o, query }),
})
