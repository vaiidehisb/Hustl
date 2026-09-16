// Payment provider adapter contract. Amounts cross this boundary in whole INR
// rupees; adapters convert to minor units (paise) for the provider API.

import type { IncomingHttpHeaders } from "node:http"
import type { CheckoutDetails, PaymentProviderName, SubscriptionCheckoutDetails, SubscriptionInterval, SubscriptionProductKey } from "@hustl/contracts"

export type FundingIntentInput = {
  dealId: string
  intentId: string
  /** rupees */
  amount: number
  currency: string
  idempotencyKey: string
  description: string
}

export type FundingIntentResult = {
  providerIntentId: string
  /** Stripe client secret / Razorpay order id / test secret — stored to rebuild checkout. */
  clientSecret: string
  checkout: CheckoutDetails
}

// ─── Subscriptions ───────────────────────────────────────────────────────────

export type SubscriptionIntentInput = {
  subscriptionId: string
  product: SubscriptionProductKey
  /** rupees per interval */
  amount: number
  currency: string
  interval: SubscriptionInterval
  /** brandId or creatorId — used as the provider-side customer reference */
  subscriberRef: string
  email: string
  name: string
  description: string
  idempotencyKey: string
}

export type SubscriptionIntentResult = {
  providerSubscriptionId: string
  /** Stripe client secret / Razorpay short url — stored so checkout can be rebuilt. */
  checkoutRef: string | null
  checkout: SubscriptionCheckoutDetails
  /** Set when the provider already reports the first period. */
  currentPeriodStart?: Date | null
  currentPeriodEnd?: Date | null
}

export type CancelSubscriptionInput = { providerSubscriptionId: string; atPeriodEnd: boolean }

/** Provider-reported invoice for one billing period. */
export type NormalizedInvoice = { providerInvoiceId: string | null; amountMinor: number | null; periodStart: Date | null; periodEnd: Date | null }

export type NormalizedWebhookEvent =
  | { kind: "funding.succeeded"; eventId: string; type: string; providerIntentId: string; paymentRef: string; amountMinor: number | null }
  /** A subscription period was paid for (first activation and every renewal — the service tells them apart). */
  | { kind: "subscription.paid"; eventId: string; type: string; providerSubscriptionId: string; periodStart: Date | null; periodEnd: Date | null; invoice: NormalizedInvoice | null }
  | { kind: "subscription.payment_failed"; eventId: string; type: string; providerSubscriptionId: string; reason: string; invoice: NormalizedInvoice | null }
  | { kind: "subscription.cancelled"; eventId: string; type: string; providerSubscriptionId: string; at: Date | null }
  | { kind: "funding.failed"; eventId: string; type: string; providerIntentId: string; reason: string }
  | { kind: "account.updated"; eventId: string; type: string; providerAccountId: string; status: "PENDING" | "ACTIVE" | "RESTRICTED"; detailsSubmitted: boolean }
  | { kind: "transfer.failed"; eventId: string; type: string; providerRef: string; reason: string }
  | { kind: "ignored"; eventId: string; type: string }

export type PayoutAccountLinkInput = {
  creatorId: string
  email: string
  name: string
  existingAccountId: string | null
  returnUrl: string
  refreshUrl: string
  razorpay?: {
    phone: string
    legalBusinessName?: string
    businessType: string
    category: string
    subcategory: string
    address: { street1: string; street2?: string; city: string; state: string; postalCode: string; country: string }
  }
}

export type PayoutAccountLinkResult = { accountId: string; url: string | null; status: "PENDING" | "ACTIVE" | "RESTRICTED"; detailsSubmitted: boolean }

export type TransferInput = { accountId: string; amount: number; currency: string; dealId: string; payoutId: string; idempotencyKey: string }
export type TransferResult = { providerRef: string; status: "PAID" | "PENDING" }

export type RefundInput = { paymentRef: string; amount: number; dealId: string; idempotencyKey: string }
export type RefundResult = { providerRef: string }

export interface PaymentProviderAdapter {
  readonly name: PaymentProviderName
  createFundingIntent(input: FundingIntentInput): Promise<FundingIntentResult>
  /** Rebuild checkout details for an existing REQUIRES_PAYMENT intent. */
  checkoutFor(intent: { id: string; providerIntentId: string; clientSecret: string; totalAmount: number; currency: string }): CheckoutDetails
  /** Throws a 400 BAD_REQUEST when the signature is missing or invalid. */
  verifyWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): void
  parseWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): NormalizedWebhookEvent
  createPayoutAccountLink(input: PayoutAccountLinkInput): Promise<PayoutAccountLinkResult>
  transferToCreator(input: TransferInput): Promise<TransferResult>
  refund(input: RefundInput): Promise<RefundResult>
  /** Opens a recurring subscription with the provider. 503 when its credentials/plan ids are missing. */
  createSubscription(input: SubscriptionIntentInput): Promise<SubscriptionIntentResult>
  /** Rebuild checkout details for an existing PENDING subscription. */
  subscriptionCheckoutFor(sub: { id: string; providerSubscriptionId: string; checkoutRef: string | null; priceAmount: number; currency: string }): SubscriptionCheckoutDetails
  cancelSubscription(input: CancelSubscriptionInput): Promise<void>
}

export const toMinor = (rupees: number) => Math.round(rupees * 100)
