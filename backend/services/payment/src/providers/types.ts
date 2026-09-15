// Payment provider adapter contract. Amounts cross this boundary in whole INR
// rupees; adapters convert to minor units (paise) for the provider API.

import type { IncomingHttpHeaders } from "node:http"
import type { CheckoutDetails, PaymentProviderName } from "@hustl/contracts"

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

export type NormalizedWebhookEvent =
  | { kind: "funding.succeeded"; eventId: string; type: string; providerIntentId: string; paymentRef: string; amountMinor: number | null }
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
}

export const toMinor = (rupees: number) => Math.round(rupees * 100)
