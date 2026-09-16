import { prisma, type Prisma } from "@hustl/db"
import { errors, publish, TOPICS, type AuthUser } from "@hustl/common"
import type { CreatorPublicProfile, OwnCreatorProfile, PortfolioItem, RateCardItem, UpdateCreatorProfileRequest } from "@hustl/contracts"
import { activeBadge, toOwnCreatorProfile } from "../lib/mappers"
import { isUniqueViolation } from "../lib/prisma-errors"
import { reviewsReceivedBy } from "../repositories/reviews.repository"
import { activeUserFilter, isHandleTaken, loadActiveUser } from "../repositories/users.repository"

const WORKED_WITH_LIMIT = 12

async function ownCreator(userId: string) {
  const user = await loadActiveUser(userId, { creator: true })
  if (!user.creator || user.creator.deletedAt) throw errors.notFound("Creator profile")
  return user.creator
}

export async function getOwnCreatorProfile(userId: string): Promise<OwnCreatorProfile> {
  return toOwnCreatorProfile(await ownCreator(userId))
}

export async function updateOwnCreatorProfile(userId: string, input: UpdateCreatorProfileRequest): Promise<OwnCreatorProfile> {
  const creator = await ownCreator(userId)
  const changedFields = Object.keys(input) as (keyof UpdateCreatorProfileRequest)[]
  if (!changedFields.length) return toOwnCreatorProfile(creator)

  if (input.handle && input.handle !== creator.handle && (await isHandleTaken(prisma, input.handle)))
    throw errors.conflict("That handle is already taken", { field: "handle" })

  const { rateCard, portfolio, ...scalars } = input
  const data: Prisma.CreatorProfileUpdateInput = {
    ...scalars,
    ...(rateCard && { rateCard: rateCard satisfies RateCardItem[] as Prisma.InputJsonValue }),
    ...(portfolio && { portfolio: portfolio satisfies PortfolioItem[] as Prisma.InputJsonValue }),
  }
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.creatorProfile.update({ where: { id: creator.id }, data })
      await publish(tx, TOPICS.CREATOR_PROFILE_UPDATED, row.id, { creatorId: row.id, userId, handle: row.handle, changedFields })
      return row
    })
    return toOwnCreatorProfile(updated)
  } catch (err) {
    if (isUniqueViolation(err)) throw errors.conflict("That handle is already taken", { field: "handle" })
    throw err
  }
}

export async function getPublicCreatorProfile(handle: string, viewer?: AuthUser): Promise<CreatorPublicProfile> {
  const c = await prisma.creatorProfile.findFirst({
    where: { handle, deletedAt: null, user: activeUserFilter },
    include: {
      user: { select: { name: true, createdAt: true } },
      score: true,
      socialAccounts: {
        where: { status: { not: "DISCONNECTED" } },
        orderBy: { followers: { sort: "desc", nulls: "last" } },
        // Explicit select: audience demographics and provider ids stay private.
        select: { platform: true, handle: true, profileUrl: true, followers: true, engagementRate: true, avgViews: true, source: true, status: true, lastSyncedAt: true },
      },
    },
  })
  if (!c) throw errors.notFound("Creator")

  const [completedDeals, brandDeals, reviews, savedByViewer] = await Promise.all([
    prisma.deal.count({ where: { creatorId: c.id, status: "COMPLETED" } }),
    prisma.deal.findMany({
      where: { creatorId: c.id, status: "COMPLETED", brand: { deletedAt: null, user: activeUserFilter } },
      orderBy: { completedAt: { sort: "desc", nulls: "last" } },
      distinct: ["brandId"],
      take: WORKED_WITH_LIMIT,
      select: { brand: { select: { companyName: true, slug: true, logoUrl: true } } },
    }),
    reviewsReceivedBy(c.userId),
    viewer?.role === "BRAND"
      ? prisma.savedCreator
          .count({ where: { creatorId: c.id, brand: { userId: viewer.id } } })
          .then((n) => n > 0)
      : Promise.resolve(null),
  ])

  return {
    id: c.id,
    handle: c.handle,
    name: c.user.name,
    headline: c.headline,
    bio: c.bio,
    location: c.location,
    country: c.country,
    avatarUrl: c.avatarUrl,
    niches: c.niches,
    languages: c.languages,
    rateCard: Array.isArray(c.rateCard) ? (c.rateCard as RateCardItem[]) : [],
    portfolio: Array.isArray(c.portfolio) ? (c.portfolio as PortfolioItem[]) : [],
    available: c.available,
    verified: !!c.verifiedAt,
    badgeTier: activeBadge(c),
    badgeUntil: c.badgeUntil ? c.badgeUntil.toISOString() : null,
    followersTotal: c.followersTotal,
    engagementRate: c.engagementRate,
    followerGrowth30d: c.followerGrowth30d,
    onTimeRate: c.onTimeRate,
    scores: c.score
      ? {
          trustScore: c.score.trustScore,
          nicheAuthority: c.score.nicheAuthority,
          reliabilityScore: c.score.reliabilityScore,
          authenticityScore: c.score.authenticityScore,
          modelVersion: c.score.modelVersion,
          computedAt: c.score.computedAt.toISOString(),
        }
      : null,
    socialAccounts: c.socialAccounts.map((s) => ({ ...s, lastSyncedAt: s.lastSyncedAt?.toISOString() ?? null })),
    completedDeals,
    workedWith: brandDeals.map((d) => d.brand),
    ...reviews,
    memberSince: c.user.createdAt.toISOString(),
    savedByViewer,
  }
}
