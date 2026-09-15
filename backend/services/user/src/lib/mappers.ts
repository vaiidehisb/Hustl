// Prisma rows → public DTOs (contracts). Never leaks password hashes, token hashes or audience PII.
import type { BrandProfile, CreatorProfile, User, VerificationRequest } from "@hustl/db"
import type {
  InternalUser,
  OwnBrandProfile,
  OwnCreatorProfile,
  PortfolioItem,
  PublicUser,
  RateCardItem,
  VerificationRequestDto,
} from "@hustl/contracts"

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)
const jsonArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    image: u.image,
    role: u.role,
    status: u.status,
    kycStatus: u.kycStatus,
    hasPassword: !!u.passwordHash,
    googleLinked: !!u.googleId,
    lastLoginAt: iso(u.lastLoginAt),
    createdAt: u.createdAt.toISOString(),
  }
}

export function toOwnCreatorProfile(c: CreatorProfile): OwnCreatorProfile {
  return {
    id: c.id,
    userId: c.userId,
    handle: c.handle,
    headline: c.headline,
    bio: c.bio,
    location: c.location,
    country: c.country,
    avatarUrl: c.avatarUrl,
    niches: c.niches,
    languages: c.languages,
    rateCard: jsonArray<RateCardItem>(c.rateCard),
    portfolio: jsonArray<PortfolioItem>(c.portfolio),
    available: c.available,
    verifiedAt: iso(c.verifiedAt),
    followersTotal: c.followersTotal,
    engagementRate: c.engagementRate,
    followerGrowth30d: c.followerGrowth30d,
    completedDeals: c.completedDeals,
    avgRating: c.avgRating,
    onTimeRate: c.onTimeRate,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}

export function toOwnBrandProfile(b: BrandProfile): OwnBrandProfile {
  return {
    id: b.id,
    userId: b.userId,
    slug: b.slug,
    companyName: b.companyName,
    logoUrl: b.logoUrl,
    website: b.website,
    industry: b.industry,
    description: b.description,
    location: b.location,
    size: b.size,
    gstin: b.gstin,
    plan: b.plan,
    verifiedAt: iso(b.verifiedAt),
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  }
}

export function toInternalUser(u: User & { creator?: { id: string } | null; brand?: { id: string } | null }): InternalUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    image: u.image,
    role: u.role,
    status: u.status,
    kycStatus: u.kycStatus,
    creatorId: u.creator?.id ?? null,
    brandId: u.brand?.id ?? null,
    deleted: !!u.deletedAt,
  }
}

export function toVerificationDto(v: VerificationRequest): VerificationRequestDto {
  return {
    id: v.id,
    userId: v.userId,
    type: v.type,
    status: v.status,
    details: (v.details && typeof v.details === "object" && !Array.isArray(v.details) ? v.details : {}) as VerificationRequestDto["details"],
    documentIds: v.documentIds,
    reviewerNote: v.reviewerNote,
    createdAt: v.createdAt.toISOString(),
    reviewedAt: iso(v.reviewedAt),
  }
}
