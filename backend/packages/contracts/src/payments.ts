// Contracts for the payment domain — owned by payment-service (see backend/API.md).
// Money is whole INR rupees everywhere in the API; providers convert to paise.
import { z } from "zod"
import type { PaymentMode } from "./common"

// ─── Fee model (shared by deal-service snapshots, payment-service and the UI) ──

export const BRAND_PLANS = ["STARTER", "GROWTH", "ENTERPRISE"] as const
export type BrandPlanName = (typeof BRAND_PLANS)[number]

/** The fee a brand pays with no paid plan. Paid plans lower it — see PLAN_CATALOG. */
export const STARTER_BRAND_FEE_RATE = 0.08
export const CREATOR_FEE_RATE = 0.05
export const PROCESSING_FEE_RATE = 0.02

// ─── Plan catalog — the single source of truth for what we sell ───────────────
// The server bills from this and the UI renders pricing from it, so a price or
// an entitlement can never drift between the two.

export const SUBSCRIPTION_PRODUCTS = ["BRAND_GROWTH", "BRAND_ENTERPRISE", "CREATOR_BADGE_STANDARD", "CREATOR_BADGE_PRIORITY"] as const
export type SubscriptionProductKey = (typeof SUBSCRIPTION_PRODUCTS)[number]

export const SUBSCRIPTION_INTERVALS = ["MONTH", "YEAR"] as const
export type SubscriptionInterval = (typeof SUBSCRIPTION_INTERVALS)[number]

export const BADGE_TIERS = ["STANDARD", "PRIORITY"] as const
export type BadgeTier = (typeof BADGE_TIERS)[number]

export type PlanProduct = {
  key: SubscriptionProductKey
  audience: "BRAND" | "CREATOR"
  name: string
  tagline: string
  /** Whole INR for one interval. `null` = priced on request (sales-led). */
  price: number | null
  interval: SubscriptionInterval
  /** Can a caller buy it themselves? Enterprise is set by an admin. */
  selfServe: boolean
  /** Brand plan this product grants (brand products only). */
  brandPlan: BrandPlanName | null
  /** Brand platform fee while the plan is active (brand products only). */
  brandFeeRate: number | null
  /** Paid placement badge this product grants (creator products only). */
  badgeTier: BadgeTier | null
  unlocks: string[]
}

export const PLAN_CATALOG: readonly PlanProduct[] = [
  {
    key: "BRAND_GROWTH",
    audience: "BRAND",
    name: "Growth",
    tagline: "Lower platform fee and advanced analytics for brands running campaigns every month.",
    price: 2999,
    interval: "MONTH",
    selfServe: true,
    brandPlan: "GROWTH",
    brandFeeRate: 0.05,
    badgeTier: null,
    unlocks: ["5% brand platform fee on new offers (down from 8%)", "Advanced brand analytics"],
  },
  {
    key: "BRAND_ENTERPRISE",
    audience: "BRAND",
    name: "Enterprise",
    tagline: "Custom pricing for high-volume brands. Talk to us — an admin activates it on your account.",
    price: null,
    interval: "MONTH",
    selfServe: false,
    brandPlan: "ENTERPRISE",
    brandFeeRate: 0.05,
    badgeTier: null,
    unlocks: ["5% brand platform fee on new offers (down from 8%)", "Advanced brand analytics", "Dedicated support and custom terms"],
  },
  {
    key: "CREATOR_BADGE_STANDARD",
    audience: "CREATOR",
    name: "Verified Creator badge",
    // Paid placement — deliberately worded so it is never confused with KYC.
    tagline: "A paid badge on your public profile. This is promotion, not identity verification (KYC stays free).",
    price: 999,
    interval: "YEAR",
    selfServe: true,
    brandPlan: null,
    brandFeeRate: null,
    badgeTier: "STANDARD",
    unlocks: ["Verified Creator badge on your public profile", "Ranked above unbadged creators in discovery"],
  },
  {
    key: "CREATOR_BADGE_PRIORITY",
    audience: "CREATOR",
    name: "Verified Creator badge — Priority",
    tagline: "The paid badge plus priority placement in discovery. Promotion, not identity verification.",
    price: 1999,
    interval: "YEAR",
    selfServe: true,
    brandPlan: null,
    brandFeeRate: null,
    badgeTier: "PRIORITY",
    unlocks: ["Verified Creator badge on your public profile", "Top of the badged group in discovery", "Priority placement in brand search results"],
  },
] as const

export const planProduct = (key: string): PlanProduct | undefined => PLAN_CATALOG.find((p) => p.key === key)

/** Products a caller can buy for themselves (Enterprise is admin-granted). */
export const SELF_SERVE_PRODUCTS = PLAN_CATALOG.filter((p) => p.selfServe).map((p) => p.key) as [SubscriptionProductKey, ...SubscriptionProductKey[]]

const catalogBrandFeeRate = (plan: BrandPlanName): number => PLAN_CATALOG.find((p) => p.brandPlan === plan)?.brandFeeRate ?? STARTER_BRAND_FEE_RATE

/** Derived from PLAN_CATALOG so a plan's discount can never drift from what we sell. */
export const BRAND_FEE_RATES: Record<BrandPlanName, number> = {
  STARTER: STARTER_BRAND_FEE_RATE,
  GROWTH: catalogBrandFeeRate("GROWTH"),
  ENTERPRISE: catalogBrandFeeRate("ENTERPRISE"),
}

export const brandFeeRateForPlan = (plan: string): number => BRAND_FEE_RATES[plan as BrandPlanName] ?? BRAND_FEE_RATES.STARTER

/** The badge tier a product grants, if any. */
export const badgeTierForProduct = (product: string): BadgeTier | null => planProduct(product)?.badgeTier ?? null

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

export const SUBSCRIBER_TYPES = ["BRAND", "CREATOR"] as const
export type SubscriberType = (typeof SUBSCRIBER_TYPES)[number]
export const SUBSCRIPTION_STATUSES = ["PENDING", "ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]
/** MANUAL = admin grant (Enterprise, comps); no money moves through a provider. */
export const SUBSCRIPTION_PROVIDERS = ["STRIPE", "RAZORPAY", "TEST", "MANUAL"] as const
export type SubscriptionProviderName = (typeof SUBSCRIPTION_PROVIDERS)[number]
export const SUBSCRIPTION_INVOICE_STATUSES = ["PENDING", "PAID", "FAILED", "REFUNDED"] as const
export type SubscriptionInvoiceStatus = (typeof SUBSCRIPTION_INVOICE_STATUSES)[number]

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

// ─── Billing requests ────────────────────────────────────────────────────────

/** POST /payments/billing/subscribe — self-serve products only. */
export const subscribeRequest = z.object({ product: z.enum(SELF_SERVE_PRODUCTS) })
export type SubscribeRequest = z.infer<typeof subscribeRequest>

/** POST /admin/billing/subscriptions — grant or change a plan (Enterprise, comps, downgrades). */
export const adminGrantSubscriptionRequest = z
  .object({
    subscriberType: z.enum(SUBSCRIBER_TYPES),
    brandId: z.string().uuid().optional(),
    creatorId: z.string().uuid().optional(),
    product: z.enum(SUBSCRIPTION_PRODUCTS),
    /** Whole INR actually charged off-platform; 0 for a comp. Defaults to the catalog price (0 when custom). */
    priceAmount: z.number().int().min(0).max(100_000_000).optional(),
    /** How long the granted period lasts. Defaults to one catalog interval. */
    periodDays: z.number().int().min(1).max(3650).optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((v) => (v.subscriberType === "BRAND" ? !!v.brandId && !v.creatorId : !!v.creatorId && !v.brandId), {
    message: "Provide brandId for a BRAND subscription, creatorId for a CREATOR subscription",
    path: ["brandId"],
  })
export type AdminGrantSubscriptionRequest = z.infer<typeof adminGrantSubscriptionRequest>

export const adminSubscriptionsQuery = z.object({
  status: z.enum(SUBSCRIPTION_STATUSES).optional(),
  product: z.enum(SUBSCRIPTION_PRODUCTS).optional(),
  subscriberType: z.enum(SUBSCRIBER_TYPES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})
export type AdminSubscriptionsQuery = z.infer<typeof adminSubscriptionsQuery>

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

// ─── Billing DTOs ────────────────────────────────────────────────────────────

/**
 * Where the caller finishes paying for a subscription. Mirrors CheckoutDetails.
 * `hostedUrl` is the provider-hosted page to redirect to — the recommended flow
 * for a recurring mandate, since no card fields are entered in our app.
 */
export type SubscriptionCheckoutDetails =
  | { provider: "STRIPE"; subscriptionId: string; hostedUrl: string | null; clientSecret: string | null; publishableKey: string | null }
  | { provider: "RAZORPAY"; subscriptionId: string; keyId: string | null; shortUrl: string | null; amount: number; currency: string }
  | { provider: "TEST"; subscriptionId: string; clientSecret: string; confirmPath: string }

export type SubscriptionInvoiceDTO = {
  id: string
  subscriptionId: string
  amount: number
  currency: string
  status: SubscriptionInvoiceStatus
  provider: SubscriptionProviderName
  providerInvoiceId: string | null
  periodStart: string
  periodEnd: string
  paidAt: string | null
  failureReason: string | null
  createdAt: string
}

export type SubscriptionDTO = {
  id: string
  subscriberType: SubscriberType
  brandId: string | null
  creatorId: string | null
  product: SubscriptionProductKey
  productName: string
  status: SubscriptionStatus
  provider: SubscriptionProviderName
  providerSubscriptionId: string | null
  priceAmount: number
  currency: string
  interval: SubscriptionInterval
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  cancelledAt: string | null
  /** True while the subscriber still gets the entitlement (ACTIVE/PAST_DUE and inside the period). */
  entitled: boolean
  note: string | null
  createdAt: string
  updatedAt: string
}

/** GET /payments/billing/products — the catalog plus what the caller already has. */
export type BillingProductsResponse = {
  /** Products the caller can see: their own audience (+ everything for admins). */
  products: (PlanProduct & { owned: boolean; ownedSubscriptionId: string | null })[]
  audience: SubscriberType | "ADMIN" | null
  currency: string
}

/** GET /payments/billing/subscription */
export type BillingSubscriptionResponse = {
  subscriptions: SubscriptionDTO[]
  invoices: SubscriptionInvoiceDTO[]
  /** Current entitlements derived from the active subscriptions. */
  entitlements: { brandPlan: BrandPlanName | null; brandFeeRate: number | null; badgeTier: BadgeTier | null; badgeUntil: string | null }
}

export type SubscribeResponse = { subscription: SubscriptionDTO; checkout: SubscriptionCheckoutDetails | null; alreadyActive: boolean }

export type CancelSubscriptionResponse = { subscription: SubscriptionDTO; accessUntil: string }

export type ConfirmTestSubscriptionResponse = { subscription: SubscriptionDTO; invoice: SubscriptionInvoiceDTO | null; duplicate: boolean; outcome: string }

export type ExpireSubscriptionsResult = { expired: number; ids: string[] }
