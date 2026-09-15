// Contracts for the payment domain — owned by payment-service (see backend/API.md).
// Money is whole INR rupees everywhere in the API; providers convert to paise.
import { z } from "zod"
import type { PaymentMode } from "./common"

// ─── Fee model (shared by deal-service snapshots, payment-service and the UI) ──

export const BRAND_FEE_RATES = { STARTER: 0.08, GROWTH: 0.05, ENTERPRISE: 0.05 } as const
export type BrandPlanName = keyof typeof BRAND_FEE_RATES
export const CREATOR_FEE_RATE = 0.05
export const PROCESSING_FEE_RATE = 0.02

export const brandFeeRateForPlan = (plan: string): number => BRAND_FEE_RATES[plan as BrandPlanName] ?? BRAND_FEE_RATES.STARTER

export type FundingBreakdown = { escrow: number; brandFee: number; processingFee: number; total: number }

/** What the brand pays at funding: escrow + brand fee + processing pass-through. */
export function fundingBreakdown(amount: number, brandFeeRate: number, processingFeeRate = PROCESSING_FEE_RATE): FundingBreakdown {
  const brandFee = Math.round(amount * brandFeeRate)
  const processingFee = Math.round(amount * processingFeeRate)
  return { escrow: amount, brandFee, processingFee, total: amount + brandFee + processingFee }
}

export type PayoutBreakdown = { gross: number; fee: number; net: number }

/** What the creator receives when a milestone of `gross` is released. */
export function payoutBreakdown(gross: number, creatorFeeRate = CREATOR_FEE_RATE): PayoutBreakdown {
  const fee = Math.round(gross * creatorFeeRate)
  return { gross, fee, net: gross - fee }
}

// ─── Enums ───────────────────────────────────────────────────────────────────

export const PAYMENT_PROVIDERS = ["STRIPE", "RAZORPAY", "TEST"] as const
export type PaymentProviderName = (typeof PAYMENT_PROVIDERS)[number]
export const ESCROW_STATUSES = ["UNFUNDED", "FUNDING", "FUNDED", "PARTIALLY_RELEASED", "RELEASED", "REFUNDED", "FROZEN"] as const
export type EscrowStatus = (typeof ESCROW_STATUSES)[number]
export const PAYMENT_INTENT_STATUSES = ["REQUIRES_PAYMENT", "PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED"] as const
export type PaymentIntentStatus = (typeof PAYMENT_INTENT_STATUSES)[number]
export const LEDGER_ENTRY_TYPES = ["ESCROW_FUND", "BRAND_FEE", "PROCESSING_FEE", "RELEASE", "CREATOR_FEE", "REFUND"] as const
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number]
export const PAYOUT_STATUSES = ["PENDING", "ON_HOLD", "PAID", "FAILED"] as const
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number]
export const DISPUTE_STATUSES = ["OPEN", "UNDER_REVIEW", "RESOLVED"] as const
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number]
export const DISPUTE_RESOLUTIONS = ["RELEASE_TO_CREATOR", "REFUND_TO_BRAND", "SPLIT"] as const
export type DisputeResolution = (typeof DISPUTE_RESOLUTIONS)[number]
export const PAYOUT_ACCOUNT_STATUSES = ["NOT_CONNECTED", "PENDING", "ACTIVE", "RESTRICTED"] as const
export type PayoutAccountStatus = (typeof PAYOUT_ACCOUNT_STATUSES)[number]

// ─── Requests ────────────────────────────────────────────────────────────────

export const dealIdParams = z.object({ dealId: z.string().uuid() })
export const idParams = z.object({ id: z.string().uuid() })
export const milestoneIdParams = z.object({ milestoneId: z.string().uuid() })

export const onboardingLinkRequest = z.object({
  returnUrl: z.string().url().optional(),
  refreshUrl: z.string().url().optional(),
  /** Razorpay Route linked accounts need business details up front (no hosted onboarding). */
  razorpay: z
    .object({
      phone: z.string().min(8).max(15),
      legalBusinessName: z.string().min(2).max(200).optional(),
      businessType: z.enum(["individual", "proprietorship", "partnership", "private_limited", "public_limited", "llp", "not_yet_registered"]).default("individual"),
      category: z.string().min(1).default("others"),
      subcategory: z.string().min(1).default("others"),
      address: z.object({
        street1: z.string().min(1),
        street2: z.string().optional(),
        city: z.string().min(1),
        state: z.string().min(1),
        postalCode: z.string().min(4),
        country: z.string().length(2).default("IN"),
      }),
    })
    .optional(),
})
export type OnboardingLinkRequest = z.infer<typeof onboardingLinkRequest>

export const resolveDisputeRequest = z
  .object({
    resolution: z.enum(DISPUTE_RESOLUTIONS),
    splitCreatorPercent: z.number().int().min(1).max(99).optional(),
    note: z.string().trim().min(1).max(4000),
  })
  .refine((v) => v.resolution !== "SPLIT" || v.splitCreatorPercent !== undefined, {
    message: "splitCreatorPercent is required for a SPLIT resolution",
    path: ["splitCreatorPercent"],
  })
  .refine((v) => v.resolution === "SPLIT" || v.splitCreatorPercent === undefined, {
    message: "splitCreatorPercent is only valid for a SPLIT resolution",
    path: ["splitCreatorPercent"],
  })
export type ResolveDisputeRequest = z.infer<typeof resolveDisputeRequest>

export const adminDisputesQuery = z.object({
  status: z.enum(DISPUTE_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const ledgerQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  dealId: z.string().uuid().optional(),
})

export const payoutsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(PAYOUT_STATUSES).optional(),
})

/** Internal (deal-service → payment-service). */
export const internalCreateDisputeRequest = z.object({
  dealId: z.string().uuid(),
  milestoneId: z.string().uuid().nullish(),
  raisedById: z.string().uuid(),
  reason: z.string().trim().min(10).max(4000),
  evidenceIds: z.array(z.string().uuid()).max(20).default([]),
})
export type InternalCreateDisputeRequest = z.infer<typeof internalCreateDisputeRequest>

// ─── DTOs ────────────────────────────────────────────────────────────────────

export type CheckoutDetails =
  | { provider: "STRIPE"; clientSecret: string; publishableKey: string | null }
  | { provider: "RAZORPAY"; orderId: string; keyId: string | null; amount: number; currency: string }
  | { provider: "TEST"; clientSecret: string; confirmPath: string }

export type PaymentIntentDTO = {
  id: string
  dealId: string
  provider: PaymentProviderName
  status: PaymentIntentStatus
  escrowAmount: number
  brandFee: number
  processingFee: number
  totalAmount: number
  currency: string
  failureReason: string | null
  createdAt: string
  updatedAt: string
}

export type CreateFundingIntentResponse = { intent: PaymentIntentDTO; checkout: CheckoutDetails | null }

export type EscrowSummary = {
  dealId: string
  status: EscrowStatus
  provider: PaymentProviderName | null
  fundedAmount: number
  releasedAmount: number
  refundedAmount: number
  /** fundedAmount − releasedAmount − refundedAmount */
  availableAmount: number
  frozen: boolean
  frozenAt: string | null
  funding: FundingBreakdown
  paymentMode: PaymentMode
}

export type LedgerEntryDTO = {
  id: string
  dealId: string
  dealTitle?: string
  milestoneId: string | null
  type: LedgerEntryType
  amount: number
  provider: PaymentProviderName
  providerRef: string | null
  createdAt: string
}

export type PayoutDTO = {
  id: string
  dealId: string
  dealTitle?: string
  milestoneId: string
  milestoneTitle?: string
  creatorId: string
  gross: number
  fee: number
  net: number
  status: PayoutStatus
  provider: PaymentProviderName
  providerRef: string | null
  failureReason: string | null
  createdAt: string
  paidAt: string | null
}

export type DisputeDTO = {
  id: string
  dealId: string
  dealTitle?: string
  milestoneId: string | null
  raisedById: string
  reason: string
  evidenceIds: string[]
  status: DisputeStatus
  resolution: DisputeResolution | null
  splitCreatorPercent: number | null
  adminNote: string | null
  resolvedById: string | null
  createdAt: string
  resolvedAt: string | null
}

export type DealPaymentsResponse = {
  escrow: EscrowSummary
  intents: PaymentIntentDTO[]
  ledger: LedgerEntryDTO[]
  payouts: PayoutDTO[]
  disputes: DisputeDTO[]
}

export type PayoutAccountDTO = {
  creatorId: string
  provider: PaymentProviderName | null
  providerAccountId: string | null
  status: PayoutAccountStatus
  detailsSubmitted: boolean
  updatedAt: string | null
}

export type OnboardingLinkResponse = { account: PayoutAccountDTO; url: string | null }

export type BrandPaymentSummary = {
  role: "BRAND"
  totalFunded: number
  feesPaid: number
  escrowHeld: number
  refunded: number
  activeEscrows: number
}

export type CreatorPaymentSummary = {
  role: "CREATOR"
  paidOut: number
  pendingPayouts: number
  onHoldPayouts: number
  feesPaid: number
  inEscrow: number
  payoutAccountStatus: PayoutAccountStatus
}

export type PaymentSummary = BrandPaymentSummary | CreatorPaymentSummary

export type ResolveDisputeResponse = { dispute: DisputeDTO; payouts: PayoutDTO[]; refunds: LedgerEntryDTO[] }

export type ReleaseMilestoneResponse = { payout: PayoutDTO; escrow: EscrowSummary; alreadyReleased: boolean }
