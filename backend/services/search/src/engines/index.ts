import { createElasticEngine } from "./elastic"
import { postgresEngine } from "./postgres"
import type { SearchEngine } from "./types"

export type { SearchEngine } from "./types"

/** Elasticsearch when ELASTICSEARCH_URL is set, otherwise PostgreSQL. */
export function selectEngine(): SearchEngine {
  const url = process.env.ELASTICSEARCH_URL
  return url ? createElasticEngine(url) : postgresEngine
}
