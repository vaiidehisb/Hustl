// Loads fresh rows and maps them to search documents / API results.
// Documents are stored in Elasticsearch in exactly the API result shape.

import { prisma, type Prisma } from "@hustl/db"
import type { BadgeTier, BriefSearchResult, CreatorSearchResult, SocialPlatform } from "@hustl/contracts"

export const creatorInclude = {
  user: { select: { name: true, status: true, deletedAt: true } },
  score: { select: { trustScore: true, reliabilityScore: true, authenticityScore: true } },
  socialAccounts: { where: { status: { not: "DISCONNECTED" } }, select: { platform: true } },
} satisfies Prisma.CreatorProfileInclude

export type CreatorRow = Prisma.CreatorProfileGetPayload<{ include: typeof creatorInclude }>

/** Soft-deleted profiles/users and suspended users are never searchable. */
export const searchableCreatorWhere: Prisma.CreatorProfileWhereInput = { deletedAt: null, user: { deletedAt: null, status: "ACTIVE" } }

/**
 * The paid placement badge, only while it is in date. Paid placement — it is
 * deliberately separate from `verified` (free, admin-reviewed KYC).
 */
export const activeBadgeTier = (c: { badgeTier: BadgeTier | null; badgeUntil: Date | null }, now = new Date()): BadgeTier | null =>
  c.badgeTier && c.badgeUntil && c.badgeUntil.getTime() > now.getTime() ? c.badgeTier : null

/** Explainable ranking group: 2 = priority badge, 1 = standard badge, 0 = no paid badge. */
export const badgeRank = (tier: BadgeTier | null) => (tier === "PRIORITY" ? 2 : tier === "STANDARD" ? 1 : 0)

export function creatorResult(c: CreatorRow): CreatorSearchResult {
  return {
    id: c.id,
    handle: c.handle,
    name: c.user.name,
    headline: c.headline,
    bio: c.bio,
    avatarUrl: c.avatarUrl,
    location: c.location,
    niches: c.niches,
    platforms: [...new Set(c.socialAccounts.map((a) => a.platform))].sort() as SocialPlatform[],
    followers: c.followersTotal,
    engagementRate: c.engagementRate,
    trustScore: c.score?.trustScore ?? null,
    reliabilityScore: c.score?.reliabilityScore ?? null,
    authenticityScore: c.score?.authenticityScore ?? null,
    verified: c.verifiedAt !== null,
    badgeTier: activeBadgeTier(c),
    available: c.available,
    completedDeals: c.completedDeals,
    avgRating: c.avgRating,
    createdAt: c.createdAt.toISOString(),
  }
}

export const isSearchableCreator = (c: CreatorRow) => !c.deletedAt && !c.user.deletedAt && c.user.status === "ACTIVE"

/**
 * The Elasticsearch document: the API result plus `badgeRank`, the numeric
 * placement group Elasticsearch sorts on (a keyword field would sort
 * alphabetically). Stripped again before the result leaves the service.
 */
export type CreatorDocument = CreatorSearchResult & { badgeRank: number }

export const creatorDocument = (c: CreatorRow): CreatorDocument => {
  const doc = creatorResult(c)
  return { ...doc, badgeRank: badgeRank(doc.badgeTier) }
}

export const creatorDocumentResult = ({ badgeRank: _rank, ...doc }: CreatorDocument): CreatorSearchResult => doc

export async function loadCreatorDoc(creatorId: string): Promise<CreatorDocument | null> {
  const c = await prisma.creatorProfile.findUnique({ where: { id: creatorId }, include: creatorInclude })
  return c && isSearchableCreator(c) ? creatorDocument(c) : null
}

export const briefInclude = {
  brand: { select: { id: true, companyName: true, slug: true, logoUrl: true, verifiedAt: true, deletedAt: true, user: { select: { status: true, deletedAt: true } } } },
} satisfies Prisma.BriefInclude

export type BriefRow = Prisma.BriefGetPayload<{ include: typeof briefInclude }>

/** Only published, open, live briefs from active brands. */
export const searchableBriefWhere: Prisma.BriefWhereInput = {
  status: "PUBLISHED",
  visibility: "OPEN",
  deletedAt: null,
  brand: { deletedAt: null, user: { deletedAt: null, status: "ACTIVE" } },
}

export function briefResult(b: BriefRow): BriefSearchResult {
  return {
    id: b.id,
    title: b.title,
    description: b.description,
    niche: b.niche,
    platforms: b.platforms,
    budgetPerCreator: b.budgetPerCreator,
    currency: b.currency,
    locations: b.locations,
    status: "PUBLISHED",
    publishedAt: b.publishedAt?.toISOString() ?? null,
    deadline: b.deadline?.toISOString() ?? null,
    brand: { id: b.brand.id, name: b.brand.companyName, slug: b.brand.slug, logoUrl: b.brand.logoUrl, verified: b.brand.verifiedAt !== null },
  }
}

const isSearchableBrief = (b: BriefRow) =>
  b.status === "PUBLISHED" && b.visibility === "OPEN" && !b.deletedAt && !b.brand.deletedAt && !b.brand.user.deletedAt && b.brand.user.status === "ACTIVE"

export async function loadBriefDoc(briefId: string): Promise<BriefSearchResult | null> {
  const b = await prisma.brief.findUnique({ where: { id: briefId }, include: briefInclude })
  return b && isSearchableBrief(b) ? briefResult(b) : null
}
