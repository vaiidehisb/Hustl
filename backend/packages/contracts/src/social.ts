// creator-data-service contracts (see backend/API.md → creator-data-service).
import { z } from "zod"
import { pageQuery, SOCIAL_PLATFORMS, type SocialPlatform } from "./common"

export const SOCIAL_DATA_SOURCES = ["PHYLLO", "SELF_REPORTED"] as const
export type SocialDataSource = (typeof SOCIAL_DATA_SOURCES)[number]
export const SOCIAL_ACCOUNT_STATUSES = ["PENDING", "CONNECTED", "ERROR", "DISCONNECTED"] as const
export type SocialAccountStatus = (typeof SOCIAL_ACCOUNT_STATUSES)[number]
export const FRAUD_SEVERITIES = ["LOW", "MEDIUM", "HIGH"] as const
export type FraudSeverity = (typeof FRAUD_SEVERITIES)[number]
export const FRAUD_FLAG_STATUSES = ["OPEN", "CLEARED", "CONFIRMED"] as const
export type FraudFlagStatus = (typeof FRAUD_FLAG_STATUSES)[number]

// ─── Requests ────────────────────────────────────────────────────────────────

/**
 * Creator-entered metrics. `engagementRate` is a percentage (4.2 = 4.2%) and is
 * stored as a fraction. Always surfaced with `verified: false`.
 */
export const selfReportedAccountBody = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  handle: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .transform((h) => h.replace(/^@/, "")),
  followers: z.number().int().min(0).max(2_000_000_000),
  engagementRate: z.number().min(0).max(100),
  avgViews: z.number().min(0).max(10_000_000_000).nullable().optional(),
  profileUrl: z.string().url().max(500).optional(),
})
export type SelfReportedAccountInput = z.input<typeof selfReportedAccountBody>

export const socialCreatorIdParams = z.object({ creatorId: z.string().uuid() })
export const socialAccountIdParams = z.object({ id: z.string().uuid() })

export const fraudFlagListQuery = pageQuery.extend({
  status: z.enum(FRAUD_FLAG_STATUSES).optional(),
  subject: z.enum(["CREATOR", "DEAL"]).optional(),
  severity: z.enum(FRAUD_SEVERITIES).optional(),
})
export type FraudFlagListQuery = z.infer<typeof fraudFlagListQuery>

export const fraudFlagReviewBody = z.object({
  status: z.enum(["CLEARED", "CONFIRMED"]),
  note: z.string().trim().min(1).max(2000),
})
export type FraudFlagReviewInput = z.infer<typeof fraudFlagReviewBody>

// ─── Responses ───────────────────────────────────────────────────────────────

export type IntegrationStatus = { configured: boolean; missingEnv: string[] }

export type SocialProvidersStatus = {
  phyllo: IntegrationStatus & { environment: "sandbox" | "staging" | "production"; webhookConfigured: boolean }
  selfReported: { enabled: true }
}

export type PhylloSdkToken = {
  phylloUserId: string
  sdkToken: string
  expiresAt: string
  environment: "sandbox" | "staging" | "production"
  products: string[]
}

export type SocialAccountDto = {
  id: string
  creatorId: string
  platform: SocialPlatform
  source: SocialDataSource
  /** true only for data fetched from a connected provider (Phyllo). */
  verified: boolean
  status: SocialAccountStatus
  handle: string
  profileUrl: string | null
  followers: number | null
  following: number | null
  postsCount: number | null
  avgLikes: number | null
  avgComments: number | null
  avgViews: number | null
  /** fraction, 0.042 = 4.2% */
  engagementRate: number | null
  lastSyncedAt: string | null
  syncError: string | null
  createdAt: string
  updatedAt: string
}

export type SocialMetricSnapshotDto = {
  id: string
  socialAccountId: string
  platform: SocialPlatform
  source: SocialDataSource
  followers: number
  engagementRate: number | null
  avgLikes: number | null
  avgComments: number | null
  avgViews: number | null
  capturedAt: string
}

export type CreatorScoreDto = {
  trustScore: number
  nicheAuthority: number
  reliabilityScore: number
  authenticityScore: number | null
  modelVersion: string
  signals: Record<string, unknown>
  computedAt: string
}

export type CreatorMetrics = {
  creatorId: string
  aggregate: {
    followersTotal: number
    /** follower-weighted, fraction */
    engagementRate: number | null
    /** fraction, null when there is no snapshot history in the last 30 days */
    followerGrowth30d: number | null
    verifiedFollowers: number
    selfReportedFollowers: number
    platformCount: number
  }
  platforms: SocialAccountDto[]
  /** last 90 days, oldest first */
  snapshots: SocialMetricSnapshotDto[]
  score: CreatorScoreDto | null
}

export type CreatorDemographics = {
  creatorId: string
  platforms: {
    socialAccountId: string
    platform: SocialPlatform
    source: SocialDataSource
    verified: boolean
    /** Raw Phyllo audience payload (countries, cities, gender_age_distribution…), null when not synced. */
    demographics: Record<string, unknown> | null
    lastSyncedAt: string | null
  }[]
}

export type SocialSyncResult = {
  creatorId: string
  synced: { socialAccountId: string; platform: SocialPlatform; status: SocialAccountStatus; error: string | null }[]
}

export type FraudFlagDto = {
  id: string
  subject: "CREATOR" | "DEAL"
  creatorId: string | null
  creatorHandle: string | null
  dealId: string | null
  code: string
  label: string
  severity: FraudSeverity
  source: string
  details: Record<string, unknown>
  status: FraudFlagStatus
  reviewerId: string | null
  reviewNote: string | null
  createdAt: string
  reviewedAt: string | null
}
