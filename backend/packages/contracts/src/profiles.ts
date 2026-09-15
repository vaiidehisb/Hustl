// Profile, verification and admin-user contracts — served by user-service (see backend/API.md).
import { z } from "zod"
import { handle, inrAmount, NICHES, pageQuery, ROLES, type Role, type SocialPlatform } from "./common"
import { brandCompanyName, type KycStatus, type PublicUser, type UserStatus } from "./auth"

const httpUrl = z
  .string()
  .trim()
  .url("Must be a valid URL")
  .max(2048)
  .refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) URL")

const shortText = (max: number) => z.string().trim().max(max)

// ─── Creator profile ─────────────────────────────────────────────────────────

export const rateCardItem = z.object({
  deliverable: z.string().trim().min(2, "Describe the deliverable").max(80),
  price: inrAmount,
})
export type RateCardItem = z.infer<typeof rateCardItem>

export const portfolioItem = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  url: httpUrl,
  brand: shortText(120).optional(),
  mediaId: z.string().uuid().optional(),
})
export type PortfolioItem = z.infer<typeof portfolioItem>

/** PUT /creators/me. Partial update; omitted fields are left unchanged. */
export const updateCreatorProfileRequest = z
  .object({
    handle: handle.optional(),
    headline: shortText(120).optional(),
    bio: shortText(2000).optional(),
    location: shortText(100).optional(),
    country: z.string().trim().toUpperCase().length(2, "Use a 2-letter ISO country code").optional(),
    avatarUrl: httpUrl.nullable().optional(),
    niches: z
      .array(z.enum(NICHES))
      .max(5, "Pick at most 5 niches")
      .refine((a) => new Set(a).size === a.length, "Niches must be unique")
      .optional(),
    languages: z.array(z.string().trim().min(2).max(40)).max(10).optional(),
    rateCard: z.array(rateCardItem).max(20).optional(),
    portfolio: z.array(portfolioItem).max(30).optional(),
    available: z.boolean().optional(),
  })
  .strict()
export type UpdateCreatorProfileRequest = z.infer<typeof updateCreatorProfileRequest>

// ─── Brand profile ───────────────────────────────────────────────────────────

/** Indian GSTIN: 2-digit state code, PAN, entity number, Z, checksum. */
const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Enter a valid GSTIN")

/** PUT /brands/me. Partial update; the slug is permanent so public links stay stable. */
export const updateBrandProfileRequest = z
  .object({
    companyName: brandCompanyName.optional(),
    logoUrl: httpUrl.nullable().optional(),
    website: z.union([httpUrl, z.literal("")]).optional(),
    industry: shortText(80).optional(),
    description: shortText(2000).optional(),
    location: shortText(100).optional(),
    size: shortText(40).optional(),
    gstin: gstin.nullable().optional(),
  })
  .strict()
export type UpdateBrandProfileRequest = z.infer<typeof updateBrandProfileRequest>

export const creatorHandleParams = z.object({ handle: z.string().trim().toLowerCase().min(1).max(30) })
export const brandSlugParams = z.object({ slug: z.string().trim().toLowerCase().min(1).max(80) })
export const savedCreatorParams = z.object({ creatorId: z.string().uuid() })

// ─── Verification ────────────────────────────────────────────────────────────

export const VERIFICATION_TYPES = ["CREATOR_IDENTITY", "BRAND_BUSINESS"] as const
export type VerificationType = (typeof VERIFICATION_TYPES)[number]
export type VerificationStatus = "PENDING" | "APPROVED" | "REJECTED"

/** POST /verifications. Details are submitted fields (e.g. legal name, GSTIN); documents are media asset ids owned by the caller. */
export const createVerificationRequest = z.object({
  type: z.enum(VERIFICATION_TYPES),
  details: z
    .record(z.string().min(1).max(60), z.union([z.string().max(1000), z.number(), z.boolean()]))
    .refine((d) => Object.keys(d).length <= 30, "Too many detail fields"),
  documentIds: z
    .array(z.string().uuid())
    .max(10)
    .refine((a) => new Set(a).size === a.length, "Document ids must be unique")
    .default([]),
})
export type CreateVerificationRequest = z.infer<typeof createVerificationRequest>

// ─── Admin ───────────────────────────────────────────────────────────────────

export const adminUsersQuery = pageQuery.extend({
  q: z.string().trim().max(100).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
})
export type AdminUsersQuery = z.infer<typeof adminUsersQuery>

export const adminUserStatusRequest = z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]), reason: shortText(500).optional() })
export type AdminUserStatusRequest = z.infer<typeof adminUserStatusRequest>

export const adminVerificationsQuery = pageQuery.extend({ status: z.enum(["PENDING", "APPROVED", "REJECTED"]).default("PENDING") })
export type AdminVerificationsQuery = z.infer<typeof adminVerificationsQuery>

export const verificationDecisionRequest = z.object({ approve: z.boolean(), note: shortText(1000).default("") })
export type VerificationDecisionRequest = z.infer<typeof verificationDecisionRequest>

// ─── Internal (service-to-service) ───────────────────────────────────────────

export const internalUsersBatchRequest = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) })
export type InternalUsersBatchRequest = z.infer<typeof internalUsersBatchRequest>

// ─── Response DTOs ───────────────────────────────────────────────────────────

/** The creator's own full profile (GET /creators/me). */
export type OwnCreatorProfile = {
  id: string
  userId: string
  handle: string
  headline: string
  bio: string
  location: string
  country: string
  avatarUrl: string | null
  niches: string[]
  languages: string[]
  rateCard: RateCardItem[]
  portfolio: PortfolioItem[]
  available: boolean
  verifiedAt: string | null
  followersTotal: number
  engagementRate: number | null
  followerGrowth30d: number | null
  completedDeals: number
  avgRating: number | null
  onTimeRate: number | null
  createdAt: string
  updatedAt: string
}

/** The brand's own full profile (GET /brands/me). */
export type OwnBrandProfile = {
  id: string
  userId: string
  slug: string
  companyName: string
  logoUrl: string | null
  website: string
  industry: string
  description: string
  location: string
  size: string
  gstin: string | null
  plan: "STARTER" | "GROWTH" | "ENTERPRISE"
  verifiedAt: string | null
  createdAt: string
  updatedAt: string
}

export type CreatorCompletionField = "headline" | "bio" | "location" | "niches" | "rateCard" | "portfolio" | "avatar" | "socialAccount"
export type BrandCompletionField = "companyName" | "logo" | "website" | "industry" | "description" | "location"

/** Which profile fields are still empty. `missing` is empty when `percent` is 100. */
export type ProfileCompletion = { percent: number; missing: (CreatorCompletionField | BrandCompletionField | "role")[] }

/** GET /users/me */
export type MeResponse = { user: PublicUser; creator: OwnCreatorProfile | null; brand: OwnBrandProfile | null; profileCompletion: ProfileCompletion }

export type CreatorScoreSummary = {
  trustScore: number
  nicheAuthority: number
  reliabilityScore: number
  authenticityScore: number | null
  modelVersion: string
  computedAt: string
}

/** Public metrics for one connected account. Audience demographics are never exposed here. */
export type SocialAccountSummary = {
  platform: SocialPlatform
  handle: string
  profileUrl: string | null
  followers: number | null
  engagementRate: number | null
  avgViews: number | null
  /** SELF_REPORTED numbers are unverified and must be labelled as such in the UI. */
  source: "PHYLLO" | "SELF_REPORTED"
  status: "PENDING" | "CONNECTED" | "ERROR" | "DISCONNECTED"
  lastSyncedAt: string | null
}

export type PublicReview = {
  id: string
  rating: number
  comment: string
  createdAt: string
  author: { name: string; image: string | null; role: Role | null; brand: { companyName: string; slug: string; logoUrl: string | null } | null; creator: { handle: string; avatarUrl: string | null } | null }
}

export type ReviewStats = { count: number; avgRating: number | null }

/** GET /creators/:handle */
export type CreatorPublicProfile = {
  id: string
  handle: string
  name: string
  headline: string
  bio: string
  location: string
  country: string
  avatarUrl: string | null
  niches: string[]
  languages: string[]
  rateCard: RateCardItem[]
  portfolio: PortfolioItem[]
  available: boolean
  verified: boolean
  followersTotal: number
  engagementRate: number | null
  followerGrowth30d: number | null
  onTimeRate: number | null
  scores: CreatorScoreSummary | null
  socialAccounts: SocialAccountSummary[]
  completedDeals: number
  /** Distinct brands the creator completed deals with (most recent first, max 12). */
  workedWith: { companyName: string; slug: string; logoUrl: string | null }[]
  reviewStats: ReviewStats
  reviews: PublicReview[]
  memberSince: string
  /** Only set when the viewer is a brand. */
  savedByViewer: boolean | null
}

/** GET /brands/:slug */
export type BrandPublicProfile = {
  id: string
  slug: string
  companyName: string
  logoUrl: string | null
  website: string
  industry: string
  description: string
  location: string
  size: string
  verified: boolean
  openBriefs: number
  completedDeals: number
  reviewStats: ReviewStats
  reviews: PublicReview[]
  memberSince: string
}

/** GET /brands/me/saved-creators items */
export type SavedCreatorItem = {
  savedAt: string
  creator: {
    id: string
    handle: string
    name: string
    avatarUrl: string | null
    headline: string
    niches: string[]
    location: string
    followersTotal: number
    engagementRate: number | null
    available: boolean
    verified: boolean
  }
}

export type SavedCreatorState = { creatorId: string; saved: boolean }

export type VerificationRequestDto = {
  id: string
  userId: string
  type: VerificationType
  status: VerificationStatus
  details: Record<string, string | number | boolean>
  documentIds: string[]
  reviewerNote: string | null
  createdAt: string
  reviewedAt: string | null
}

export type AdminVerificationItem = VerificationRequestDto & {
  user: { id: string; email: string; name: string; role: Role | null; kycStatus: KycStatus }
  creator: { id: string; handle: string } | null
  brand: { id: string; slug: string; companyName: string; gstin: string | null } | null
}

export type AdminUserListItem = {
  id: string
  email: string
  name: string
  role: Role | null
  status: UserStatus
  kycStatus: KycStatus
  createdAt: string
  lastLoginAt: string | null
  creator: { id: string; handle: string } | null
  brand: { id: string; slug: string; companyName: string } | null
}

/** GET /internal/users/:id and POST /internal/users/batch. */
export type InternalUser = {
  id: string
  email: string
  name: string
  image: string | null
  role: Role | null
  status: UserStatus
  kycStatus: KycStatus
  creatorId: string | null
  brandId: string | null
  deleted: boolean
}

/** GET /internal/creators/:id and /internal/creators/by-user/:userId */
export type InternalCreator = OwnCreatorProfile & { user: InternalUser; deleted: boolean }

/** GET /internal/brands/:id and /internal/brands/by-user/:userId */
export type InternalBrand = OwnBrandProfile & { user: InternalUser; deleted: boolean }

