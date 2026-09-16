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

/**
 * Paid placement groups, highest first: priority badge, standard badge, no badge.
 * Only creators whose badge is still in date count — `badgeUntil` in the past is
 * the same as no badge. This is placement only: the filters in `creatorWhere`
 * still decide who is in the result set at all.
 */
export function badgeGroups(now = new Date()): Prisma.CreatorProfileWhereInput[] {
  const inDate = { badgeUntil: { gt: now } }
  return [
    { badgeTier: "PRIORITY", ...inDate },
    { badgeTier: "STANDARD", ...inDate },
    { OR: [{ badgeTier: null }, { badgeUntil: null }, { badgeUntil: { lte: now } }] },
  ]
}

export const postgresEngine: SearchEngine = {
  name: "postgres",

  async searchCreators(q) {
    const where = creatorWhere(q)
    const skip = (q.page - 1) * q.pageSize
    const find = (w: Prisma.CreatorProfileWhereInput, orderBy: CreatorOrder, s: number, take: number) =>
      take > 0 ? prisma.creatorProfile.findMany({ where: w, include: creatorInclude, orderBy: [...orderBy, { id: "asc" }], skip: s, take }) : Promise.resolve([])

    /** Pages across ordered groups: group 1 is exhausted before group 2 starts. */
    const pageGroups = async (groups: { where: Prisma.CreatorProfileWhereInput; orderBy: CreatorOrder }[]) => {
      const counts = await Promise.all(groups.map((g) => prisma.creatorProfile.count({ where: g.where })))
      const rows = []
      let offset = skip
      let remaining = q.pageSize
      for (let i = 0; i < groups.length && remaining > 0; i++) {
        if (offset >= counts[i]) {
          offset -= counts[i]
          continue
        }
        const batch = await find(groups[i].where, groups[i].orderBy, offset, Math.min(remaining, counts[i] - offset))
        rows.push(...batch)
        remaining -= batch.length
        offset = 0
      }
      return { items: rows.map(creatorResult), total: counts.reduce((a, b) => a + b, 0) }
    }

    if (q.sort === "relevance" || q.sort === "trust") {
      // Scored creators first (by trust), then unscored — Postgres puts NULLs first on DESC joins,
      // so the two groups are paged explicitly.
      const secondary: CreatorOrder = q.sort === "relevance" ? [{ followersTotal: "desc" }] : [{ engagementRate: { sort: "desc", nulls: "last" } }, { followersTotal: "desc" }]
      const scoredOrder: CreatorOrder = [{ score: { trustScore: "desc" } }, ...secondary]
      const unscoredOrder: CreatorOrder = [{ followersTotal: "desc" }]
      const byScore = (badge: Prisma.CreatorProfileWhereInput) => [
        { where: { AND: [where, badge, { score: { isNot: null } }] }, orderBy: scoredOrder },
        { where: { AND: [where, badge, { score: { is: null } }] }, orderBy: unscoredOrder },
      ]
      // Paid placement applies to the default relevance ranking only, mirroring the
      // Elasticsearch engine's badgeRank sort; `trust` stays a pure trust ordering.
      const groups = q.sort === "relevance" ? badgeGroups().flatMap(byScore) : byScore({})
      return pageGroups(groups)
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
