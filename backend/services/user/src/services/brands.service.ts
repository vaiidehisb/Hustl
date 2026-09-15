import { prisma } from "@hustl/db"
import { errors, pageMeta, publish, TOPICS } from "@hustl/common"
import type { BrandPublicProfile, OwnBrandProfile, PageQuery, SavedCreatorItem, SavedCreatorState, UpdateBrandProfileRequest } from "@hustl/contracts"
import { toOwnBrandProfile } from "../lib/mappers"
import { reviewsReceivedBy } from "../repositories/reviews.repository"
import { activeUserFilter, loadActiveUser } from "../repositories/users.repository"

async function ownBrand(userId: string) {
  const user = await loadActiveUser(userId, { brand: true })
  if (!user.brand || user.brand.deletedAt) throw errors.notFound("Brand profile")
  return user.brand
}

export async function getOwnBrandProfile(userId: string): Promise<OwnBrandProfile> {
  return toOwnBrandProfile(await ownBrand(userId))
}

export async function updateOwnBrandProfile(userId: string, input: UpdateBrandProfileRequest): Promise<OwnBrandProfile> {
  const brand = await ownBrand(userId)
  const changedFields = Object.keys(input)
  if (!changedFields.length) return toOwnBrandProfile(brand)
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.brandProfile.update({ where: { id: brand.id }, data: input })
    await publish(tx, TOPICS.BRAND_PROFILE_UPDATED, row.id, { brandId: row.id, userId, slug: row.slug, changedFields })
    return row
  })
  return toOwnBrandProfile(updated)
}

export async function getPublicBrandProfile(slug: string): Promise<BrandPublicProfile> {
  const b = await prisma.brandProfile.findFirst({
    where: { slug, deletedAt: null, user: activeUserFilter },
    include: { user: { select: { createdAt: true } } },
  })
  if (!b) throw errors.notFound("Brand")
  const [openBriefs, completedDeals, reviews] = await Promise.all([
    prisma.brief.count({ where: { brandId: b.id, status: "PUBLISHED", visibility: "OPEN", deletedAt: null } }),
    prisma.deal.count({ where: { brandId: b.id, status: "COMPLETED" } }),
    reviewsReceivedBy(b.userId),
  ])
  return {
    id: b.id,
    slug: b.slug,
    companyName: b.companyName,
    logoUrl: b.logoUrl,
    website: b.website,
    industry: b.industry,
    description: b.description,
    location: b.location,
    size: b.size,
    verified: !!b.verifiedAt,
    openBriefs,
    completedDeals,
    ...reviews,
    memberSince: b.user.createdAt.toISOString(),
  }
}

// ─── Saved creators ──────────────────────────────────────────────────────────

const visibleCreator = { deletedAt: null, user: activeUserFilter }

export async function listSavedCreators(userId: string, page: PageQuery) {
  const brand = await ownBrand(userId)
  const where = { brandId: brand.id, creator: visibleCreator }
  const [total, rows] = await Promise.all([
    prisma.savedCreator.count({ where }),
    prisma.savedCreator.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page.page - 1) * page.pageSize,
      take: page.pageSize,
      include: { creator: { include: { user: { select: { name: true } } } } },
    }),
  ])
  const items: SavedCreatorItem[] = rows.map((r) => ({
    savedAt: r.createdAt.toISOString(),
    creator: {
      id: r.creator.id,
      handle: r.creator.handle,
      name: r.creator.user.name,
      avatarUrl: r.creator.avatarUrl,
      headline: r.creator.headline,
      niches: r.creator.niches,
      location: r.creator.location,
      followersTotal: r.creator.followersTotal,
      engagementRate: r.creator.engagementRate,
      available: r.creator.available,
      verified: !!r.creator.verifiedAt,
    },
  }))
  return { items, meta: pageMeta(page, total) }
}

export async function saveCreator(userId: string, creatorId: string): Promise<SavedCreatorState> {
  const brand = await ownBrand(userId)
  const creator = await prisma.creatorProfile.findFirst({ where: { id: creatorId, ...visibleCreator }, select: { id: true } })
  if (!creator) throw errors.notFound("Creator")
  await prisma.savedCreator.upsert({
    where: { brandId_creatorId: { brandId: brand.id, creatorId } },
    create: { brandId: brand.id, creatorId },
    update: {},
  })
  return { creatorId, saved: true }
}

export async function unsaveCreator(userId: string, creatorId: string): Promise<SavedCreatorState> {
  const brand = await ownBrand(userId)
  await prisma.savedCreator.deleteMany({ where: { brandId: brand.id, creatorId } })
  return { creatorId, saved: false }
}
