import { z } from "zod"

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "INTEGRATION_UNAVAILABLE"
  | "SERVICE_UNAVAILABLE"
  | "TIMEOUT"

export type ApiError = { success: false; error: { code: ApiErrorCode; message: string; details?: unknown } }
export type ApiSuccess<T> = { success: true; data: T; meta?: PageMeta & Record<string, unknown> }
export type ApiResponse<T> = ApiSuccess<T> | ApiError

export type PageMeta = { page?: number; pageSize?: number; total?: number; totalPages?: number }
export type Paginated<T> = { items: T[]; page: number; pageSize: number; total: number; totalPages: number }

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})
export type PageQuery = z.infer<typeof pageQuery>

export const ROLES = ["BRAND", "CREATOR", "ADMIN"] as const
export type Role = (typeof ROLES)[number]

export const SOCIAL_PLATFORMS = ["INSTAGRAM", "YOUTUBE", "TIKTOK", "LINKEDIN", "X"] as const
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]

export const NICHES = ["fashion", "beauty", "fitness", "tech", "food", "travel", "finance", "gaming", "education", "family", "lifestyle"] as const
export type Niche = (typeof NICHES)[number]

export const PAYMENT_MODES = ["COMPLETION", "UPFRONT", "MILESTONES"] as const
export type PaymentMode = (typeof PAYMENT_MODES)[number]

export const DEAL_STATUSES = ["OFFER_SENT", "NEGOTIATING", "AGREED", "CONTRACT_SIGNED", "FUNDED", "IN_PROGRESS", "COMPLETED", "DISPUTED", "CANCELLED"] as const
export type DealStatus = (typeof DEAL_STATUSES)[number]

export const MILESTONE_STATUSES = ["PENDING", "SUBMITTED", "REVISION_REQUESTED", "APPROVED", "RELEASED", "DISPUTED", "REFUNDED"] as const
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number]

export const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128)
  .regex(/[a-z]/i, "Password must contain a letter")
  .regex(/[0-9]/, "Password must contain a number")

export const handle = z
  .string()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9_.]+$/, "Use lowercase letters, numbers, dots or underscores")

export const inrAmount = z.number().int().positive().max(100_000_000)
