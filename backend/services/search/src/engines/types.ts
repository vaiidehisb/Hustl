import type { BriefSearchResult, CreatorSearchResult, SearchBriefsQuery, SearchCreatorsQuery, SearchEngineName } from "@hustl/contracts"

export type SearchPage<T> = { items: T[]; total: number }

/** One interface for Elasticsearch and the PostgreSQL fallback. */
export interface SearchEngine {
  readonly name: SearchEngineName
  searchCreators(query: SearchCreatorsQuery): Promise<SearchPage<CreatorSearchResult>>
  searchBriefs(query: SearchBriefsQuery): Promise<SearchPage<BriefSearchResult>>
  /** Upserts (or deletes, when no longer searchable) one creator document. No-op for Postgres. */
  indexCreator(creatorId: string): Promise<void>
  indexBrief(briefId: string): Promise<void>
  reindexAll(): Promise<{ creators: number; briefs: number; skipped: boolean }>
  health(): Promise<string>
  close?(): Promise<void>
}
