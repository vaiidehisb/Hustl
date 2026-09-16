// Pure display helpers shared across brand portal pages (server + client safe).
// No API or Prisma imports here — this file is also used by client components.

import type { ApplicationStatus, BriefStatus, DealStatus, DealSummary, DealUiAction, LedgerEntryType, SocialPlatform } from "@hustl/contracts"
import { BRAND_FEE_RATES, PROCESSING_FEE_RATE, SOCIAL_PLATFORMS } from "@hustl/contracts"

export const PAYMENT_MODE_LABEL: Record<string, string> = {
  COMPLETION: "On completion",
  UPFRONT: "Upfront",
  MILESTONES: "Milestones",
}

export const TX_LABEL: Record<LedgerEntryType | string, string> = {
  ESCROW_FUND: "Escrow funded",
  BRAND_FEE: "Platform fee",
  PROCESSING_FEE: "Processing fee",
  RELEASE: "Released to creator",
  CREATOR_FEE: "Creator fee (withheld)",
  REFUND: "Refund to you",
}

/** Money leaving the brand's account at funding time. */
export const OUTFLOW_TYPES: string[] = ["ESCROW_FUND", "BRAND_FEE", "PROCESSING_FEE"]

export const NICHES = ["fashion", "beauty", "fitness", "tech", "food", "travel", "finance", "gaming", "education", "family", "lifestyle"]

/** Platforms are uppercase enum values in the API (`INSTAGRAM`). */
export const PLATFORMS: readonly SocialPlatform[] = SOCIAL_PLATFORMS

export const PLATFORM_LABEL: Record<string, string> = {
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube",
  LINKEDIN: "LinkedIn",
  TIKTOK: "TikTok",
  X: "X",
}

export const platformLabel = (p: string) => PLATFORM_LABEL[p.toUpperCase()] ?? p

export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

export const brandFeeRate = (plan: string) => BRAND_FEE_RATES[plan as keyof typeof BRAND_FEE_RATES] ?? BRAND_FEE_RATES.STARTER
export const processingFeeRate = PROCESSING_FEE_RATE

// ─── Statuses ────────────────────────────────────────────────────────────────

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "brand"

const STATUS_LABEL: Record<string, string> = {
  OFFER_SENT: "Offer sent",
  NEGOTIATING: "Negotiating",
  AGREED: "Awaiting signatures",
  CONTRACT_SIGNED: "Contract signed",
  FUNDED: "Funded",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  DISPUTED: "Disputed",
  CANCELLED: "Cancelled",
  PENDING: "Pending",
  SUBMITTED: "Submitted",
  REVISION_REQUESTED: "Revision requested",
  APPROVED: "Approved",
  RELEASED: "Paid out",
  REFUNDED: "Refunded",
  DRAFT: "Draft",
  PUBLISHED: "Live",
  CLOSED: "Closed",
  APPLIED: "Applied",
  SHORTLISTED: "Shortlisted",
  OFFERED: "Offer sent",
  REJECTED: "Not selected",
  WITHDRAWN: "Withdrawn",
  UNFUNDED: "Not funded",
  FUNDING: "Funding",
  PARTIALLY_RELEASED: "Partly released",
  FROZEN: "Frozen",
}

const STATUS_TONE: Record<string, Tone> = {
  OFFER_SENT: "info",
  NEGOTIATING: "warning",
  AGREED: "warning",
  CONTRACT_SIGNED: "info",
  FUNDED: "brand",
  IN_PROGRESS: "brand",
  COMPLETED: "success",
  DISPUTED: "danger",
  CANCELLED: "neutral",
  PENDING: "neutral",
  SUBMITTED: "warning",
  REVISION_REQUESTED: "danger",
  APPROVED: "info",
  RELEASED: "success",
  REFUNDED: "neutral",
  DRAFT: "neutral",
  PUBLISHED: "success",
  CLOSED: "neutral",
  APPLIED: "info",
  SHORTLISTED: "brand",
  OFFERED: "success",
  REJECTED: "neutral",
  WITHDRAWN: "neutral",
  FROZEN: "danger",
  PARTIALLY_RELEASED: "brand",
}

export const statusLabel = (status: DealStatus | BriefStatus | ApplicationStatus | string) => STATUS_LABEL[status] ?? status
export const statusTone = (status: string): Tone => STATUS_TONE[status] ?? "neutral"

// ─── Deal queues ─────────────────────────────────────────────────────────────

/**
 * What happens next on a deal from the brand's side, derived from the summary
 * the API returns (`status` + `awaitingParty`).
 */
export function nextStep(d: Pick<DealSummary, "status" | "awaitingParty">): { text: string; yourMove: boolean } {
  const mine = d.awaitingParty === "BRAND"
  switch (d.status) {
    case "OFFER_SENT":
    case "NEGOTIATING":
      return mine ? { text: "Respond to counter-offer", yourMove: true } : { text: "Waiting on the creator", yourMove: false }
    case "AGREED":
      return { text: "Sign the contract", yourMove: true }
    case "CONTRACT_SIGNED":
      return { text: "Fund escrow to kick off", yourMove: true }
    case "FUNDED":
      return { text: "Creator is starting work", yourMove: false }
    case "IN_PROGRESS":
      return { text: "Delivery in progress", yourMove: false }
    case "COMPLETED":
      return { text: "Wrapped up", yourMove: false }
    case "DISPUTED":
      return { text: "hustl. is reviewing the dispute", yourMove: false }
    case "CANCELLED":
      return { text: "Cancelled", yourMove: false }
    default:
      return { text: "No further action", yourMove: false }
  }
}

/** Deals worth opening for their `allowedActions` (the detail call carries them). */
export const looksActionable = (d: DealSummary) =>
  (d.awaitingParty === "BRAND" && (d.status === "OFFER_SENT" || d.status === "NEGOTIATING")) ||
  d.status === "AGREED" ||
  d.status === "CONTRACT_SIGNED" ||
  d.status === "IN_PROGRESS" ||
  d.status === "COMPLETED"

export const BRAND_ACTION_LABEL: Record<DealUiAction, string> = {
  ACCEPT: "Respond",
  COUNTER: "Respond",
  DECLINE: "Respond",
  CANCEL: "Cancel",
  SIGN: "Sign",
  FUND: "Fund",
  DISPUTE: "Open dispute",
  REVIEW: "Review",
}

// ─── AI brief parser ─────────────────────────────────────────────────────────

export type ParseConfidence = "high" | "medium" | "low"

/** Response of POST /briefs/parse (the AI backend's validated brief). */
export type ParsedBriefResult = {
  title: string
  niche: string[]
  platforms: SocialPlatform[]
  deliverables: { type: string; quantity: number }[]
  audience: string[]
  budget: { per_creator: number | null; currency: string; total: number | null }
  creators_needed: number | null
  deadline: string | null
  timeline: string
  requirements: string[]
  location: string[]
  min_followers: number | null
  confidence: Record<string, ParseConfidence>
  source: "claude" | "rules" | string
  model: string | null
  parser_version?: string
  warnings?: string[]
  cached?: boolean
}

export const parserSourceLabel = (source: string) => (source === "claude" ? "Parsed by Claude" : "Parsed by rules")

// ─── Misc ────────────────────────────────────────────────────────────────────

export type RateItem = { deliverable: string; price: number }

export function minRate(rateCard: unknown): number | null {
  const prices = ((rateCard ?? []) as RateItem[]).map((r) => r?.price).filter((p): p is number => typeof p === "number" && p > 0)
  return prices.length ? Math.min(...prices) : null
}

/** "2026-03" (as returned by the analytics service) → "Mar". */
export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number)
  if (!y || !m) return month
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })
}

/** A `<input type="date">` value → an offset-aware ISO string the API accepts. */
export const dateToIso = (value: string | null | undefined) => (value ? new Date(`${value}T00:00:00.000Z`).toISOString() : null)
/** ISO string → `<input type="date">` value. */
export const isoToDate = (value: string | null | undefined) => (value ? value.slice(0, 10) : "")
