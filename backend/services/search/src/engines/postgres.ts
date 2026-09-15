// PostgreSQL engine (used when ELASTICSEARCH_URL is unset): same filters and
// sorts as the Elasticsearch engine, expressed with Prisma.

import { prisma, type Prisma } from "@hustl/db"
import type { SearchBriefsQuery, SearchCreatorsQuery } from "@hustl/contracts"
import { briefInclude, briefResult, creatorInclude, creatorResult, searchableBriefWhere, searchableCreatorWhere } from "../documents"
import type { SearchEngine } from "./types"

const insensitive = (value: string) => ({ contains: value, mode: "insensitive" as const })

export function creatorWhere(q: SearchCreatorsQuery): Prisma.CreatorProfileWhereInput {
  const and: Prisma.CreatorProfileWhereInput[] = [searchableCreatorWhere]
  if (q.q)
    and.push({
      OR: [{ handle: insensitive(q.q) }, { headline: insensitive(q.q) }, { bio: insensitive(q.q) }, { user: { name: insensitive(q.q) } }],
    })
  if (q.niche) and.push({ niches: { hasSome: q.niche } })
  if (q.platform) and.push({ socialAccounts: { some: { platform: { in: q.platform }, status: { not: "DISCONNECTED" } } } })
  if (q.minFollowers !== undefined) and.push({ followersTotal: { gte: q.minFollowers } })
  if (q.maxFollowers !== undefined) and.push({ followersTotal: { lte: q.maxFollowers } })
  if (q.minEngagement !== undefined) and.push({ engagementRate: { gte: q.minEngagement / 100 } })
  if (q.location) and.push({ location: insensitive(q.location) })
  if (q.verified !== undefined) and.push({ verifiedAt: q.verified ? { not: null } : null })
  if (q.available !== undefined) and.push({ available: q.available })
  return { AND: and }
}

export function briefWhere(q: SearchBriefsQuery): Prisma.BriefWhereInput {
  const and: Prisma.BriefWhereInput[] = [searchableBriefWhere]
  if (q.q) and.push({ OR: [{ title: insensitive(q.q) }, { description: insensitive(q.q) }, { brand: { companyName: insensitive(q.q) } }] })
  if (q.niche) and.push({ OR: q.niche.map((n) => ({ niche: { equals: n, mode: "insensitive" as const } })) })
  if (q.platform) and.push({ platforms: { hasSome: q.platform } })
  if (q.minBudget !== undefined) and.push({ budgetPerCreator: { gte: q.minBudget } })
  return { AND: and }
}

type CreatorOrder = Prisma.CreatorProfileOrderByWithRelationInput[]

export const postgresEngine: SearchEngine = {
  name: "postgres",

  async searchCreators(q) {
    const where = creatorWhere(q)
    const skip = (q.page - 1) * q.pageSize
    const find = (w: Prisma.CreatorProfileWhereInput, orderBy: CreatorOrder, s: number, take: number) =>
      take > 0 ? prisma.creatorProfile.findMany({ where: w, include: creatorInclude, orderBy: [...orderBy, { id: "asc" }], skip: s, take }) : Promise.resolve([])

    if (q.sort === "relevance" || q.sort === "trust") {
      // Scored creators first (by trust), then unscored — Postgres puts NULLs first on DESC joins,
      // so the two groups are paged explicitly.
      const scored = { AND: [where, { score: { isNot: null } }] }
      const unscored = { AND: [where, { score: { is: null } }] }
      const [scoredTotal, unscoredTotal] = await Promise.all([prisma.creatorProfile.count({ where: scored }), prisma.creatorProfile.count({ where: unscored })])
      const secondary: CreatorOrder = q.sort === "relevance" ? [{ followersTotal: "desc" }] : [{ engagementRate: { sort: "desc", nulls: "last" } }, { followersTotal: "desc" }]
      const fromScored = await find(scored, [{ score: { trustScore: "desc" } }, ...secondary], skip, Math.max(0, Math.min(q.pageSize, scoredTotal - skip)))
      const remaining = q.pageSize - fromScored.length
      const fromUnscored = await find(unscored, [{ followersTotal: "desc" }], Math.max(0, skip - scoredTotal), remaining)
      return { items: [...fromScored, ...fromUnscored].map(creatorResult), total: scoredTotal + unscoredTotal }
    }

    const orders: Record<"followers" | "engagement" | "newest", CreatorOrder> = {
      followers: [{ followersTotal: "desc" }],
      engagement: [{ engagementRate: { sort: "desc", nulls: "last" } }, { followersTotal: "desc" }],
      newest: [{ createdAt: "desc" }],
    }
    const [rows, total] = await Promise.all([find(where, orders[q.sort], skip, q.pageSize), prisma.creatorProfile.count({ where })])
    return { items: rows.map(creatorResult), total }
  },

  async searchBriefs(q) {
    const where = briefWhere(q)
    const orders: Record<SearchBriefsQuery["sort"], Prisma.BriefOrderByWithRelationInput[]> = {
      newest: [{ publishedAt: { sort: "desc", nulls: "last" } }],
      budget: [{ budgetPerCreator: "desc" }],
      deadline: [{ deadline: { sort: "asc", nulls: "last" } }],
    }
    const [rows, total] = await Promise.all([
      prisma.brief.findMany({ where, include: briefInclude, orderBy: [...orders[q.sort], { id: "asc" }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      prisma.brief.count({ where }),
    ])
    return { items: rows.map(briefResult), total }
  },

  // Queries read live tables, so there is nothing to index.
  async indexCreator() {},
  async indexBrief() {},
  async reindexAll() {
    return { creators: 0, briefs: 0, skipped: true }
  },
  async health() {
    return "not configured (postgres engine)"
  },
}
