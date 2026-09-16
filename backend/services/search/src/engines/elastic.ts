// Elasticsearch engine: `creators` and `briefs` indices (prefixed by
// ELASTICSEARCH_INDEX_PREFIX), documents stored in the API result shape.

import { Client, errors as esErrors } from "@elastic/elasticsearch"
import type { estypes } from "@elastic/elasticsearch"
import { prisma } from "@hustl/db"
import type { BriefSearchResult, CreatorSearchResult, SearchBriefsQuery, SearchCreatorsQuery } from "@hustl/contracts"
import {
  briefInclude,
  briefResult,
  creatorDocument,
  creatorDocumentResult,
  creatorInclude,
  loadBriefDoc,
  loadCreatorDoc,
  searchableBriefWhere,
  searchableCreatorWhere,
  type CreatorDocument,
} from "../documents"
import type { SearchEngine } from "./types"

export const creatorMappings: estypes.MappingTypeMapping = {
  dynamic: "strict",
  properties: {
    id: { type: "keyword" },
    handle: { type: "text", fields: { keyword: { type: "keyword" } } },
    name: { type: "text", fields: { keyword: { type: "keyword" } } },
    headline: { type: "text" },
    bio: { type: "text" },
    avatarUrl: { type: "keyword", index: false },
    location: { type: "text", fields: { keyword: { type: "keyword" } } },
    niches: { type: "keyword" },
    platforms: { type: "keyword" },
    followers: { type: "long" },
    engagementRate: { type: "float" },
    trustScore: { type: "integer" },
    reliabilityScore: { type: "integer" },
    authenticityScore: { type: "integer" },
    verified: { type: "boolean" },
    badgeTier: { type: "keyword" },
    /// 2 = priority badge, 1 = standard badge, 0 = none. Paid placement, relevance sort only.
    badgeRank: { type: "integer" },
    available: { type: "boolean" },
    completedDeals: { type: "integer" },
    avgRating: { type: "float" },
    createdAt: { type: "date" },
  },
}

export const briefMappings: estypes.MappingTypeMapping = {
  dynamic: "strict",
  properties: {
    id: { type: "keyword" },
    title: { type: "text", fields: { keyword: { type: "keyword" } } },
    description: { type: "text" },
    niche: { type: "keyword", normalizer: "lowercase" },
    platforms: { type: "keyword" },
    budgetPerCreator: { type: "integer" },
    currency: { type: "keyword" },
    locations: { type: "keyword" },
    status: { type: "keyword" },
    publishedAt: { type: "date" },
    deadline: { type: "date" },
    brand: {
      properties: {
        id: { type: "keyword" },
        name: { type: "text", fields: { keyword: { type: "keyword" } } },
        slug: { type: "keyword" },
        logoUrl: { type: "keyword", index: false },
        verified: { type: "boolean" },
      },
    },
  },
}

const lowercaseNormalizer = { analysis: { normalizer: { lowercase: { type: "custom" as const, filter: ["lowercase"] } } } }

export function buildCreatorQuery(q: SearchCreatorsQuery): estypes.SearchRequest {
  const filter: estypes.QueryDslQueryContainer[] = []
  if (q.niche) filter.push({ terms: { niches: q.niche } })
  if (q.platform) filter.push({ terms: { platforms: q.platform } })
  if (q.minFollowers !== undefined || q.maxFollowers !== undefined)
    filter.push({ range: { followers: { ...(q.minFollowers !== undefined && { gte: q.minFollowers }), ...(q.maxFollowers !== undefined && { lte: q.maxFollowers }) } } })
  if (q.minEngagement !== undefined) filter.push({ range: { engagementRate: { gte: q.minEngagement / 100 } } })
  if (q.location) filter.push({ match: { location: { query: q.location, operator: "and" } } })
  if (q.verified !== undefined) filter.push({ term: { verified: q.verified } })
  if (q.available !== undefined) filter.push({ term: { available: q.available } })

  const must: estypes.QueryDslQueryContainer[] = q.q
    ? [{ multi_match: { query: q.q, fields: ["handle^4", "name^3", "headline^2", "bio"], type: "best_fields", fuzziness: "AUTO" } }]
    : [{ match_all: {} }]

  // Paid placement: badged creators lead the default relevance ranking. Explicit
  // sorts (followers, engagement, trust, newest) are never reordered by it, and a
  // badge never bypasses a filter above — it only moves a creator within the hits.
  const sorts: Record<SearchCreatorsQuery["sort"], estypes.SortCombinations[]> = {
    relevance: [{ badgeRank: { order: "desc", missing: "_last" } }, "_score", { trustScore: { order: "desc", missing: "_last" } }, { followers: "desc" }],
    followers: [{ followers: "desc" }, { trustScore: { order: "desc", missing: "_last" } }],
    engagement: [{ engagementRate: { order: "desc", missing: "_last" } }, { followers: "desc" }],
    trust: [{ trustScore: { order: "desc", missing: "_last" } }, { followers: "desc" }],
    newest: [{ createdAt: "desc" }],
  }
  return {
    from: (q.page - 1) * q.pageSize,
    size: q.pageSize,
    track_total_hits: true,
    query: { bool: { must, filter } },
    sort: [...sorts[q.sort], { id: "asc" }],
  }
}

export function buildBriefQuery(q: SearchBriefsQuery): estypes.SearchRequest {
  const filter: estypes.QueryDslQueryContainer[] = [{ term: { status: "PUBLISHED" } }]
  if (q.niche) filter.push({ terms: { niche: q.niche } })
  if (q.platform) filter.push({ terms: { platforms: q.platform } })
  if (q.minBudget !== undefined) filter.push({ range: { budgetPerCreator: { gte: q.minBudget } } })
  const must: estypes.QueryDslQueryContainer[] = q.q
    ? [{ multi_match: { query: q.q, fields: ["title^3", "description", "brand.name^2"], fuzziness: "AUTO" } }]
    : [{ match_all: {} }]
  const sorts: Record<SearchBriefsQuery["sort"], estypes.SortCombinations[]> = {
    newest: [{ publishedAt: { order: "desc", missing: "_last" } }],
    budget: [{ budgetPerCreator: "desc" }],
    deadline: [{ deadline: { order: "asc", missing: "_last" } }],
  }
  return {
    from: (q.page - 1) * q.pageSize,
    size: q.pageSize,
    track_total_hits: true,
    query: { bool: { must, filter } },
    sort: [...(q.q && q.sort === "newest" ? ["_score" as const] : []), ...sorts[q.sort], { id: "asc" }],
  }
}

const total = (t: estypes.SearchTotalHits | number | undefined) => (typeof t === "number" ? t : (t?.value ?? 0))

export function createElasticEngine(url: string): SearchEngine {
  const client = new Client({
    node: url,
    ...(process.env.ELASTICSEARCH_API_KEY && { auth: { apiKey: process.env.ELASTICSEARCH_API_KEY } }),
    ...(process.env.ELASTICSEARCH_USERNAME && {
      auth: { username: process.env.ELASTICSEARCH_USERNAME, password: process.env.ELASTICSEARCH_PASSWORD ?? "" },
    }),
    requestTimeout: 10_000,
  })
  const prefix = process.env.ELASTICSEARCH_INDEX_PREFIX ?? "hustl"
  const index = { creators: `${prefix}-creators`, briefs: `${prefix}-briefs` }
  let ensured: Promise<void> | undefined

  const ensureIndices = () =>
    (ensured ??= (async () => {
      for (const [name, mappings, settings] of [
        [index.creators, creatorMappings, undefined],
        [index.briefs, briefMappings, lowercaseNormalizer],
      ] as const) {
        if (!(await client.indices.exists({ index: name }))) {
          try {
            await client.indices.create({ index: name, mappings, ...(settings && { settings }) })
          } catch (err) {
            if (!(err instanceof esErrors.ResponseError && err.body?.error?.type === "resource_already_exists_exception")) throw err
          }
        }
      }
    })().catch((err) => {
      ensured = undefined
      throw err
    }))

  const deleteDoc = async (idx: string, id: string) => {
    try {
      await client.delete({ index: idx, id, refresh: "wait_for" })
    } catch (err) {
      if (!(err instanceof esErrors.ResponseError && err.statusCode === 404)) throw err
    }
  }

  return {
    name: "elasticsearch",

    async searchCreators(q) {
      await ensureIndices()
      const res = await client.search<CreatorDocument>({ index: index.creators, ...buildCreatorQuery(q) })
      return { items: res.hits.hits.map((h) => creatorDocumentResult(h._source!)), total: total(res.hits.total) }
    },

    async searchBriefs(q) {
      await ensureIndices()
      const res = await client.search<BriefSearchResult>({ index: index.briefs, ...buildBriefQuery(q) })
      return { items: res.hits.hits.map((h) => h._source!), total: total(res.hits.total) }
    },

    async indexCreator(creatorId) {
      await ensureIndices()
      const doc = await loadCreatorDoc(creatorId)
      if (doc) await client.index({ index: index.creators, id: doc.id, document: doc })
      else await deleteDoc(index.creators, creatorId)
    },

    async indexBrief(briefId) {
      await ensureIndices()
      const doc = await loadBriefDoc(briefId)
      if (doc) await client.index({ index: index.briefs, id: doc.id, document: doc })
      else await deleteDoc(index.briefs, briefId)
    },

    async reindexAll() {
      await ensureIndices()
      const bulk = async <T extends { id: string }>(idx: string, docs: T[]) => {
        if (!docs.length) return
        const res = await client.bulk({ refresh: true, operations: docs.flatMap((d) => [{ index: { _index: idx, _id: d.id } }, d]) })
        if (res.errors) {
          const failed = res.items.filter((i) => i.index?.error).slice(0, 3)
          throw new Error(`Bulk indexing failed: ${JSON.stringify(failed)}`)
        }
      }
      const seenCreators: string[] = []
      for (let cursor: string | undefined; ; ) {
        const rows = await prisma.creatorProfile.findMany({
          where: searchableCreatorWhere,
          include: creatorInclude,
          orderBy: { id: "asc" },
          take: 500,
          ...(cursor && { cursor: { id: cursor }, skip: 1 }),
        })
        if (!rows.length) break
        await bulk(index.creators, rows.map(creatorDocument))
        seenCreators.push(...rows.map((r) => r.id))
        cursor = rows[rows.length - 1].id
      }
      const seenBriefs: string[] = []
      for (let cursor: string | undefined; ; ) {
        const rows = await prisma.brief.findMany({
          where: searchableBriefWhere,
          include: briefInclude,
          orderBy: { id: "asc" },
          take: 500,
          ...(cursor && { cursor: { id: cursor }, skip: 1 }),
        })
        if (!rows.length) break
        await bulk(index.briefs, rows.map(briefResult))
        seenBriefs.push(...rows.map((r) => r.id))
        cursor = rows[rows.length - 1].id
      }
      // Remove documents that are no longer searchable.
      await client.deleteByQuery({ index: index.creators, refresh: true, query: { bool: { must_not: [{ ids: { values: seenCreators } }] } } })
      await client.deleteByQuery({ index: index.briefs, refresh: true, query: { bool: { must_not: [{ ids: { values: seenBriefs } }] } } })
      return { creators: seenCreators.length, briefs: seenBriefs.length, skipped: false }
    },

    async health() {
      const h = await client.cluster.health({ timeout: "2s" })
      return h.status === "red" ? `degraded (cluster ${h.status})` : "ok"
    },

    async close() {
      await client.close()
    },
  }
}
