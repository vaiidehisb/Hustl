// search-service contracts (see backend/API.md → search-service).
import { z } from "zod"
import { pageQuery, SOCIAL_PLATFORMS, type SocialPlatform } from "./common"
import type { BadgeTier } from "./payments"

const csv = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess((v) => {
    if (v === undefined || v === "") return undefined
    const arr = Array.isArray(v) ? v : String(v).split(",")
    return arr.map((s) => String(s).trim()).filter(Boolean)
  }, z.array(item).min(1).max(20).optional())

const bool = z.preprocess((v) => (v === "true" || v === true ? true : v === "false" || v === false ? false : v), z.boolean().optional())

export const CREATOR_SORTS = ["relevance", "followers", "engagement", "trust", "newest"] as const
export type CreatorSort = (typeof CREATOR_SORTS)[number]
export const BRIEF_SORTS = ["newest", "budget", "deadline"] as const
export type BriefSort = (typeof BRIEF_SORTS)[number]

export const searchCreatorsQuery = pageQuery
  .extend({
    q: z.string().trim().max(200).optional(),
    /** one or more niches, comma-separated */
    niche: csv(z.string().trim().toLowerCase().max(50)),
    /** one or more platforms, comma-separated */
    platform: csv(z.enum(SOCIAL_PLATFORMS)),
    minFollowers: z.coerce.number().int().min(0).optional(),
    maxFollowers: z.coerce.number().int().min(0).optional(),
    /** percentage, 3 = 3% */
    minEngagement: z.coerce.number().min(0).max(100).optional(),
    location: z.string().trim().max(100).optional(),
    verified: bool,
    available: bool,
    sort: z.enum(CREATOR_SORTS).default("relevance"),
  })
  .refine((v) => v.minFollowers === undefined || v.maxFollowers === undefined || v.minFollowers <= v.maxFollowers, {
    message: "minFollowers must be ≤ maxFollowers",
    path: ["minFollowers"],
  })
export type SearchCreatorsQuery = z.infer<typeof searchCreatorsQuery>

export const searchBriefsQuery = pageQuery.extend({
  q: z.string().trim().max(200).optional(),
  niche: csv(z.string().trim().toLowerCase().max(50)),
  platform: csv(z.enum(SOCIAL_PLATFORMS)),
  minBudget: z.coerce.number().int().min(0).optional(),
  sort: z.enum(BRIEF_SORTS).default("newest"),
})
export type SearchBriefsQuery = z.infer<typeof searchBriefsQuery>

export type SearchEngineName = "elasticsearch" | "postgres"

export type CreatorSearchResult = {
  id: string
  handle: string
  name: string
  headline: string
  bio: string
  avatarUrl: string | null
  location: string
  niches: string[]
  platforms: SocialPlatform[]
  followers: number
  /** follower-weighted fraction */
  engagementRate: number | null
  trustScore: number | null
  reliabilityScore: number | null
  authenticityScore: number | null
  /** Identity-verified (KYC). Free and admin-reviewed. */
  verified: boolean
  /** Active paid placement badge, or null. Paid placement — not identity verification. */
  badgeTier: BadgeTier | null
  available: boolean
  completedDeals: number
  avgRating: number | null
  createdAt: string
}

export type BriefSearchResult = {
  id: string
  title: string
  description: string
  niche: string
  platforms: SocialPlatform[]
  budgetPerCreator: number
  currency: string
  locations: string[]
  status: "PUBLISHED"
  publishedAt: string | null
  deadline: string | null
  brand: { id: string; name: string; slug: string; logoUrl: string | null; verified: boolean }
}

/** Response meta for both search endpoints. */
export type SearchMeta = { page: number; pageSize: number; total: number; totalPages: number; engine: SearchEngineName }

export type ReindexResult = { engine: SearchEngineName; creators: number; briefs: number; skipped: boolean }
