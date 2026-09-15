// Contracts for briefs & applications — owned by deal-service (see backend/API.md).
import { z } from "zod"
import { inrAmount, SOCIAL_PLATFORMS, type SocialPlatform } from "./common"

export const BRIEF_STATUSES = ["DRAFT", "PUBLISHED", "CLOSED"] as const
export type BriefStatus = (typeof BRIEF_STATUSES)[number]
export const BRIEF_VISIBILITIES = ["OPEN", "DIRECT"] as const
export type BriefVisibility = (typeof BRIEF_VISIBILITIES)[number]
export const APPLICATION_STATUSES = ["APPLIED", "SHORTLISTED", "OFFERED", "REJECTED", "WITHDRAWN"] as const
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

const deliverableItem = z.object({ type: z.string().trim().min(1).max(80), quantity: z.number().int().min(1).max(100) })

const briefFields = {
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().min(10).max(10_000),
  requirements: z.string().trim().max(5000).default(""),
  niche: z.string().trim().max(60).default(""),
  platforms: z.array(z.enum(SOCIAL_PLATFORMS)).max(5).default([]),
  deliverables: z.array(deliverableItem).max(30).default([]),
  minFollowers: z.number().int().min(0).max(1_000_000_000).default(0),
  /** fraction, 0.03 = 3% */
  minEngagement: z.number().min(0).max(1).default(0),
  budgetPerCreator: inrAmount,
  creatorsNeeded: z.number().int().min(1).max(1000).default(1),
  locations: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  timeline: z.string().trim().max(500).default(""),
  audience: z.string().trim().max(1000).default(""),
  visibility: z.enum(BRIEF_VISIBILITIES).default("OPEN"),
  deadline: z.string().datetime({ offset: true }).nullish(),
  /** Output of POST /briefs/parse the brand accepted (kept for provenance). */
  parsed: z.record(z.unknown()).nullish(),
}

export const createBriefRequest = z.object(briefFields)
export type CreateBriefRequest = z.infer<typeof createBriefRequest>

export const updateBriefRequest = z
  .object({
    title: briefFields.title,
    description: briefFields.description,
    requirements: z.string().trim().max(5000),
    niche: z.string().trim().max(60),
    platforms: z.array(z.enum(SOCIAL_PLATFORMS)).max(5),
    deliverables: z.array(deliverableItem).max(30),
    minFollowers: z.number().int().min(0).max(1_000_000_000),
    minEngagement: z.number().min(0).max(1),
    budgetPerCreator: inrAmount,
    creatorsNeeded: z.number().int().min(1).max(1000),
    locations: z.array(z.string().trim().min(1).max(80)).max(30),
    timeline: z.string().trim().max(500),
    audience: z.string().trim().max(1000),
    visibility: z.enum(BRIEF_VISIBILITIES),
    deadline: z.string().datetime({ offset: true }).nullable(),
    parsed: z.record(z.unknown()).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update" })
export type UpdateBriefRequest = z.infer<typeof updateBriefRequest>

export const parseBriefRequest = z.object({ text: z.string().trim().min(20).max(20_000) })
export type ParseBriefRequest = z.infer<typeof parseBriefRequest>

export const briefIdParams = z.object({ id: z.string().uuid() })

export const openBriefsQuery = z.object({
  niche: z.string().trim().max(60).optional(),
  platform: z.enum(SOCIAL_PLATFORMS).optional(),
  minBudget: z.coerce.number().int().min(0).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})
export type OpenBriefsQuery = z.infer<typeof openBriefsQuery>

export const myBriefsQuery = z.object({
  status: z.enum(BRIEF_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const briefMatchesQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) })

export const createApplicationRequest = z.object({
  pitch: z.string().trim().min(20).max(5000),
  proposedRate: inrAmount,
})
export type CreateApplicationRequest = z.infer<typeof createApplicationRequest>

export const updateApplicationStatusRequest = z.object({ status: z.enum(["SHORTLISTED", "REJECTED"]) })
export type UpdateApplicationStatusRequest = z.infer<typeof updateApplicationStatusRequest>

export const applicationsQuery = z.object({
  status: z.enum(APPLICATION_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

/** Internal: AI backend (or batch job) pushes a score result. */
export const applicationScoreResult = z.object({
  matchScore: z.number().min(0).max(100),
  matchReasons: z.array(z.string()).max(50).default([]),
  disqualifiers: z.array(z.string()).max(50).default([]),
  modelVersion: z.string().max(100).nullish(),
})
export type ApplicationScoreResult = z.infer<typeof applicationScoreResult>

// ─── DTOs ────────────────────────────────────────────────────────────────────

export type BriefBrandDTO = { id: string; companyName: string; slug: string; logoUrl: string | null; verified: boolean }

export type BriefDTO = {
  id: string
  brandId: string
  brand?: BriefBrandDTO
  title: string
  description: string
  requirements: string
  niche: string
  platforms: SocialPlatform[]
  deliverables: { type: string; quantity: number }[]
  minFollowers: number
  minEngagement: number
  budgetPerCreator: number
  currency: string
  creatorsNeeded: number
  locations: string[]
  timeline: string
  audience: string
  visibility: BriefVisibility
  status: BriefStatus
  deadline: string | null
  parsed: Record<string, unknown> | null
  publishedAt: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
  applicationsCount?: number
  /** Set on marketplace/detail responses for creators. */
  myApplication?: { id: string; status: ApplicationStatus } | null
}

export type CreatorPublicDTO = {
  id: string
  handle: string
  name: string
  avatarUrl: string | null
  headline: string
  location: string
  niches: string[]
  followersTotal: number
  engagementRate: number | null
  verified: boolean
  available: boolean
  completedDeals: number
  avgRating: number | null
  onTimeRate: number | null
  trustScore: number | null
  reliabilityScore: number | null
}

export type BriefMatchDTO = {
  creator: CreatorPublicDTO
  matchScore: number
  matchReasons: string[]
  disqualifiers: string[]
  components: Record<string, unknown> | null
}

export type ApplicationDTO = {
  id: string
  briefId: string
  creatorId: string
  pitch: string
  proposedRate: number
  status: ApplicationStatus
  matchScore: number | null
  matchReasons: string[]
  disqualifiers: string[]
  scoreModelVersion: string | null
  scoredAt: string | null
  createdAt: string
  updatedAt: string
  creator?: CreatorPublicDTO
  brief?: Pick<BriefDTO, "id" | "title" | "status" | "budgetPerCreator" | "deadline"> & { brand: BriefBrandDTO }
  dealId?: string | null
}

/** meta on publish: whether the AI brief embedding succeeded (it is retried when it fails). */
export type PublishBriefMeta = { aiEmbedding: "ok" | "failed" }
/** meta on apply: synchronous scoring outcome. */
export type ApplyMeta = { aiScoring: "scored" | "queued" | "failed" }
