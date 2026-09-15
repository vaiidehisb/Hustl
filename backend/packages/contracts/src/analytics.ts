// analytics-service contracts (see backend/API.md → analytics-service).
import { z } from "zod"
import { pageQuery, type DealStatus, type MilestoneStatus } from "./common"

export const analyticsRangeQuery = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: "from must be before to", path: ["from"] })
export type AnalyticsRangeQuery = z.infer<typeof analyticsRangeQuery>

export const analyticsCampaignsQuery = pageQuery.extend({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})
export type CampaignsQuery = z.infer<typeof analyticsCampaignsQuery>

export const analyticsDealIdParams = z.object({ id: z.string().uuid() })

/** Month buckets are UTC, `month` = "YYYY-MM". Amounts in whole INR. */
export type MonthlyPoint = { month: string; amount: number }

export type BrandOverview = {
  brandId: string
  range: { from: string | null; to: string | null }
  /** ESCROW_FUND + BRAND_FEE + PROCESSING_FEE */
  totalSpend: number
  spendBreakdown: { escrowFunded: number; brandFees: number; processingFees: number }
  /** funded − released − refunded across the brand's escrow accounts (current) */
  escrowHeld: number
  dealsByStatus: Record<DealStatus, number>
  totalDeals: number
  /** average hours from offer (deal creation) to FUNDED, null when no deal was funded */
  avgHoursToFund: number | null
  /** last 12 months, zero-filled, oldest first */
  monthlySpend: MonthlyPoint[]
  activeBriefs: number
}

export type CampaignAnalytics = {
  briefId: string
  title: string
  status: "DRAFT" | "PUBLISHED" | "CLOSED"
  publishedAt: string | null
  applications: number
  /** SHORTLISTED + OFFERED */
  shortlisted: number
  /** deals created from the brief (any status) */
  offers: number
  /** deals that reached AGREED or later (excluding CANCELLED) */
  deals: number
  spend: number
  avgMatchScore: number | null
}

export type CreatorOverview = {
  creatorId: string
  range: { from: string | null; to: string | null }
  /** net payouts with status PAID in range */
  totalEarned: number
  /** last 12 months, zero-filled, by paid date */
  monthlyEarnings: MonthlyPoint[]
  pending: {
    /** payouts PENDING / ON_HOLD (net) */
    payoutsPending: number
    /** milestones APPROVED and not yet released (gross); included in inEscrow */
    approvedAwaitingRelease: number
    /** funded − released − refunded across the creator's deals (gross) */
    inEscrow: number
    total: number
  }
  applications: { total: number; offered: number; winRate: number | null }
  onTimeRate: number | null
  revisionRate: number | null
  avgRating: number | null
  reviewCount: number
  completedDeals: number
  activeDeals: number
  scores: {
    trustScore: number
    nicheAuthority: number
    reliabilityScore: number
    authenticityScore: number | null
    modelVersion: string
    computedAt: string
  } | null
}

export type DealStageDuration = { status: DealStatus; enteredAt: string; exitedAt: string | null; durationHours: number }

export type DealMilestoneAnalytics = {
  id: string
  position: number
  title: string
  amount: number
  status: MilestoneStatus
  dueDate: string | null
  firstSubmittedAt: string | null
  approvedAt: string | null
  releasedAt: string | null
  revisionCount: number
  /** null when there is no due date or no submission yet */
  onTime: boolean | null
}

export type DealAnalytics = {
  dealId: string
  title: string
  status: DealStatus
  amount: number
  currency: string
  createdAt: string
  completedAt: string | null
  totalHours: number
  stages: DealStageDuration[]
  milestones: DealMilestoneAnalytics[]
  milestoneOnTimeRate: number | null
  money: { escrowFunded: number; brandFees: number; processingFees: number; released: number; creatorFees: number; refunded: number }
}

export type DealReport = DealAnalytics & {
  brand: { id: string; name: string }
  creator: { id: string; handle: string; name: string }
  paymentMode: string
  ledger: { id: string; type: string; amount: number; milestoneId: string | null; createdAt: string }[]
  reviews: { rating: number; comment: string; authorRole: "BRAND" | "CREATOR"; createdAt: string }[]
}

export type AdminMetrics = {
  range: { from: string | null; to: string | null }
  /** sum of ESCROW_FUND */
  gmv: number
  /** BRAND_FEE + CREATOR_FEE */
  platformRevenue: number
  revenueBreakdown: { brandFees: number; creatorFees: number }
  /** platformRevenue / gmv, null when gmv = 0 */
  takeRate: number | null
  activeDeals: number
  dealsByStatus: Record<DealStatus, number>
  users: { total: number; byRole: { BRAND: number; CREATOR: number; ADMIN: number; UNASSIGNED: number }; suspended: number }
  openDisputes: number
  openFraudFlags: number
}
