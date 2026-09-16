// Contracts for deals, offers, contracts, milestones, disputes and reviews —
// owned by deal-service (see backend/API.md).
import { z } from "zod"
import { inrAmount, PAYMENT_MODES, type DealStatus, type MilestoneStatus, type PaymentMode } from "./common"

export const MAX_COUNTER_ROUNDS = 2
export const DISPUTE_WINDOW_HOURS = 72
export const UPFRONT_MIN_RELIABILITY = 85
export const FRAUD_HOLD_HOURS = 24
export const FRAUD_NEW_BRAND_DAYS = 7
export const FRAUD_HIGH_VALUE_AMOUNT = 100_000
export const MIN_DEAL_AMOUNT = 500

export const DEAL_ACTIONS = [
  "COUNTER",
  "ACCEPT",
  "DECLINE",
  "CANCEL",
  "SIGN",
  "FUND",
  "START",
  "COMPLETE",
  "DISPUTE",
  "RESOLVE",
] as const
export type DealAction = (typeof DEAL_ACTIONS)[number]

export const MILESTONE_ACTIONS = ["SUBMIT", "APPROVE", "REQUEST_REVISION", "RELEASE", "REFUND", "DISPUTE"] as const
export type MilestoneAction = (typeof MILESTONE_ACTIONS)[number]

/** Actions surfaced to the UI in `allowedActions` (party-scoped, context-aware). */
export type DealUiAction = "COUNTER" | "ACCEPT" | "DECLINE" | "CANCEL" | "SIGN" | "FUND" | "DISPUTE" | "REVIEW"
export type MilestoneUiAction = "SUBMIT" | "APPROVE" | "REQUEST_REVISION" | "RETRY_RELEASE"

export const OFFER_STATUSES = ["PENDING", "ACCEPTED", "COUNTERED", "DECLINED", "WITHDRAWN", "SUPERSEDED"] as const
export type OfferStatus = (typeof OFFER_STATUSES)[number]
export type PartyName = "BRAND" | "CREATOR"

// ─── Milestones ──────────────────────────────────────────────────────────────

export const milestoneInput = z.object({
  title: z.string().trim().min(2).max(140),
  percent: z.number().int().min(1).max(100),
  dueDate: z.string().datetime({ offset: true }).nullish(),
})
export type MilestoneInput = z.infer<typeof milestoneInput>

const sumsTo100 = (ms: { percent: number }[] | undefined) => !ms || ms.length === 0 || ms.reduce((s, m) => s + m.percent, 0) === 100

export type SplitMilestone = MilestoneInput & { position: number; amount: number }

/**
 * Split `amount` across milestones by percent. Amounts are whole rupees and
 * always add up to `amount` exactly: the last milestone absorbs rounding.
 */
export function splitMilestones(amount: number, milestones: MilestoneInput[]): SplitMilestone[] {
  if (!Number.isInteger(amount) || amount <= 0) throw new RangeError("Amount must be a positive whole number of rupees")
  if (!milestones.length) throw new RangeError("At least one milestone is required")
  const total = milestones.reduce((s, m) => s + m.percent, 0)
  if (total !== 100) throw new RangeError(`Milestone percentages must add up to 100 (got ${total})`)
  let allocated = 0
  return milestones.map((m, i) => {
    const value = i === milestones.length - 1 ? amount - allocated : Math.floor((amount * m.percent) / 100)
    allocated += value
    return { ...m, position: i, amount: value }
  })
}

export function defaultMilestones(mode: PaymentMode, dueDate?: string | null): MilestoneInput[] {
  return [{ title: mode === "UPFRONT" ? "Upfront delivery" : "Final delivery", percent: 100, dueDate: dueDate ?? null }]
}

// ─── Requests ────────────────────────────────────────────────────────────────

export const dealParams = z.object({ id: z.string().uuid() })
export const milestoneParams = z.object({ id: z.string().uuid(), mid: z.string().uuid() })

export const createOfferRequest = z
  .object({
    creatorId: z.string().uuid(),
    briefId: z.string().uuid().nullish(),
    applicationId: z.string().uuid().nullish(),
    title: z.string().trim().min(3).max(140),
    amount: inrAmount.min(MIN_DEAL_AMOUNT, `Deal value must be at least ₹${MIN_DEAL_AMOUNT}`),
    paymentMode: z.enum(PAYMENT_MODES),
    milestones: z.array(milestoneInput).max(10).default([]),
    deliverables: z.string().trim().min(3).max(5000),
    dueDate: z.string().datetime({ offset: true }).nullish(),
    message: z.string().trim().max(4000).optional(),
  })
  .refine((v) => sumsTo100(v.milestones), { message: "Milestone percentages must add up to 100", path: ["milestones"] })
  .refine((v) => v.paymentMode !== "MILESTONES" || v.milestones.length >= 2, {
    message: "Milestone payment mode needs at least two milestones",
    path: ["milestones"],
  })
export type CreateOfferRequest = z.infer<typeof createOfferRequest>

export const counterOfferRequest = z
  .object({
    amount: inrAmount.min(MIN_DEAL_AMOUNT, `Deal value must be at least ₹${MIN_DEAL_AMOUNT}`),
    paymentMode: z.enum(PAYMENT_MODES).optional(),
    milestones: z.array(milestoneInput).max(10).optional(),
    deliverables: z.string().trim().min(3).max(5000).optional(),
    dueDate: z.string().datetime({ offset: true }).nullish(),
    note: z.string().trim().max(4000).optional(),
  })
  .refine((v) => sumsTo100(v.milestones), { message: "Milestone percentages must add up to 100", path: ["milestones"] })
export type CounterOfferRequest = z.infer<typeof counterOfferRequest>

export const reasonRequest = z.object({ reason: z.string().trim().max(2000).optional() })
export type ReasonRequest = z.infer<typeof reasonRequest>

export const signContractRequest = z.object({
  signerName: z.string().trim().min(2).max(200),
  /** The bodyHash the signer reviewed; signing fails with 409 if the contract changed. */
  bodyHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
})
export type SignContractRequest = z.infer<typeof signContractRequest>

export const submitMilestoneRequest = z
  .object({
    url: z.string().url().max(2000).optional(),
    mediaAssetId: z.string().uuid().optional(),
    note: z.string().trim().min(1).max(4000),
  })
  .refine((v) => v.url || v.mediaAssetId, { message: "Provide a url or a mediaAssetId", path: ["url"] })
export type SubmitMilestoneRequest = z.infer<typeof submitMilestoneRequest>

export const requestRevisionRequest = z.object({ note: z.string().trim().min(3).max(4000) })
export type RequestRevisionRequest = z.infer<typeof requestRevisionRequest>

export const createDisputeRequest = z.object({
  reason: z.string().trim().min(10).max(4000),
  milestoneId: z.string().uuid().optional(),
  evidenceIds: z.array(z.string().uuid()).max(20).default([]),
})
export type CreateDisputeRequest = z.infer<typeof createDisputeRequest>

export const createReviewRequest = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(4000).default(""),
})
export type CreateReviewRequest = z.infer<typeof createReviewRequest>

/** REST alias `PATCH /deals/:id/status`. */
export const dealStatusActionRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ACCEPT") }),
  z.object({ action: z.literal("DECLINE"), reason: z.string().trim().max(2000).optional() }),
  z.object({ action: z.literal("CANCEL"), reason: z.string().trim().max(2000).optional() }),
  z.object({ action: z.literal("COUNTER"), offer: counterOfferRequest }),
  z.object({ action: z.literal("SIGN"), signerName: z.string().trim().min(2).max(200), bodyHash: z.string().regex(/^[a-f0-9]{64}$/).optional() }),
])
export type DealStatusActionRequest = z.infer<typeof dealStatusActionRequest>

export const listDealsQuery = z.object({
  role: z.enum(["brand", "creator"]).optional(),
  status: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",").map((x) => x.trim().toUpperCase()) : undefined))
    .pipe(z.array(z.enum(["OFFER_SENT", "NEGOTIATING", "AGREED", "CONTRACT_SIGNED", "FUNDED", "IN_PROGRESS", "COMPLETED", "DISPUTED", "CANCELLED"])).optional()),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})
export type ListDealsQuery = z.infer<typeof listDealsQuery>

// ─── DTOs ────────────────────────────────────────────────────────────────────

export type DealPartySummary = {
  brand: { id: string; companyName: string; slug: string; logoUrl: string | null; verified: boolean }
  creator: { id: string; handle: string; name: string; avatarUrl: string | null; verified: boolean }
}

/** Milestone roll-up carried on every deal summary, so lists never need to fetch each deal. */
export type DealMilestoneRollup = {
  total: number
  released: number
  /** Submitted and waiting for the brand to review. */
  awaitingReview: number
  revisionRequested: number
  /** The milestone the parties are working on next, if any. */
  next: { id: string; title: string; status: MilestoneStatus; amount: number; dueDate: string | null } | null
}

export type DealSummary = DealPartySummary & {
  id: string
  title: string
  status: DealStatus
  /** What the caller can do right now — the same list the deal room uses. */
  allowedActions: DealUiAction[]
  counterRoundsRemaining: number
  milestoneRollup: DealMilestoneRollup
  /** Fee rates relevant to the caller: brand sees brand+processing, creator sees creator. */
  feeRates: { brand?: number; processing?: number; creator?: number }
  amount: number
  currency: string
  paymentMode: PaymentMode
  dueDate: string | null
  awaitingParty: PartyName | null
  yourParty: PartyName | "ADMIN"
  negotiationRounds: number
  holdUntil: string | null
  briefId: string | null
  applicationId: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  cancelledAt: string | null
}

export type DealOfferDTO = {
  id: string
  round: number
  proposedBy: PartyName
  amount: number
  paymentMode: PaymentMode
  milestones: MilestoneInput[]
  deliverables: string
  dueDate: string | null
  note: string | null
  status: OfferStatus
  respondedAt: string | null
  createdAt: string
}

export type DeliverableDTO = { id: string; url: string | null; mediaAssetId: string | null; note: string | null; createdAt: string }

export type MilestoneDTO = {
  id: string
  position: number
  title: string
  percent: number
  amount: number
  dueDate: string | null
  status: MilestoneStatus
  revisionCount: number
  revisionNote: string | null
  submittedAt: string | null
  approvedAt: string | null
  releasedAt: string | null
  /** null when there is no due date or no submission yet */
  onTime: boolean | null
  submissions: DeliverableDTO[]
  allowedActions: MilestoneUiAction[]
}

export type ContractClause = { id: string; heading: string; body: string }

export type ContractTerms = {
  version: number
  dealId: string
  agreedOfferRound: number
  parties: {
    brand: { brandId: string; companyName: string; signatoryUserId: string; signatoryName: string }
    creator: { creatorId: string; handle: string; signatoryUserId: string; signatoryName: string }
  }
  scope: { title: string; deliverables: string; briefId: string | null }
  compensation: {
    currency: string
    amount: number
    paymentMode: PaymentMode
    feeRates: { brand: number; creator: number; processing: number }
    milestones: { position: number; title: string; percent: number; amount: number; dueDate: string | null }[]
  }
  escrow: { fundedBeforeWork: boolean; releaseTrigger: string }
  disputes: { windowHours: number }
  disclosure: { standard: "ASCI"; required: boolean }
  usageRights: { days: number }
  timeline: { dueDate: string | null }
  clauses: ContractClause[]
}

export type ContractSignatureDTO = { signedAt: string | null; signerName: string | null; ip?: string | null }

export type ContractDTO = {
  id: string
  dealId: string
  version: number
  terms: ContractTerms
  bodyHash: string
  signatures: { brand: ContractSignatureDTO; creator: ContractSignatureDTO }
  fullySigned: boolean
  pdfMediaId: string | null
  createdAt: string
}

export type DealEventDTO = {
  id: string
  type: string
  actorId: string | null
  fromStatus: DealStatus | null
  toStatus: DealStatus | null
  data: Record<string, unknown>
  createdAt: string
}

export type ReviewDTO = { id: string; dealId: string; authorId: string; subjectUserId: string; rating: number; comment: string; createdAt: string }

export type DealDetail = DealSummary & {
  deliverables: string
  offers: DealOfferDTO[]
  milestones: MilestoneDTO[]
  contract: ContractDTO | null
  events: DealEventDTO[]
  reviews: ReviewDTO[]
  allowedActions: DealUiAction[]
  counterRoundsRemaining: number
}

export type InternalDealDTO = {
  id: string
  title: string
  status: DealStatus
  amount: number
  currency: string
  paymentMode: PaymentMode
  brandId: string
  creatorId: string
  brandUserId: string
  creatorUserId: string
  briefId: string | null
  holdUntil: string | null
  feeRates: { brand: number; creator: number; processing: number }
  milestones: { id: string; position: number; title: string; amount: number; status: MilestoneStatus; dueDate: string | null; submittedAt: string | null }[]
  createdAt: string
  completedAt: string | null
}

export type DealParticipantsDTO = { dealId: string; brandUserId: string; creatorUserId: string; brandId: string; creatorId: string }

/** Response of milestone approve: the release outcome from payment-service. */
export type ApproveMilestoneResponse = { milestone: MilestoneDTO; release: { payoutId: string; status: string; net: number } }
