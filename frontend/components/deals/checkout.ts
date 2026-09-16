// Pure checkout-branch selection for escrow funding.
// POST /payments/deals/:dealId/intent returns { intent, checkout }; the provider
// decides which client flow runs. Kept free of React/DOM so it is unit tested.
import type { CreateFundingIntentResponse } from "@hustl/contracts"

export type CheckoutFlow =
  /** Escrow is already paid for (idempotent intent re-created after success). */
  | { kind: "SETTLED"; intentId: string; status: "SUCCEEDED" | "PROCESSING" }
  | { kind: "TEST"; intentId: string; confirmPath: string; total: number }
  | { kind: "STRIPE"; intentId: string; clientSecret: string; publishableKey: string; total: number }
  | { kind: "RAZORPAY"; intentId: string; orderId: string; keyId: string; amount: number; currency: string }
  /** The provider is configured but can't be driven from the browser (missing public key). */
  | { kind: "UNAVAILABLE"; reason: string }

export const confirmTestPath = (intentId: string) => `/payments/intents/${intentId}/confirm-test`

/**
 * Map an intent response onto the client flow to run.
 * Never infers a provider the backend didn't name, and never invents keys:
 * a missing publishable key / key id is surfaced as UNAVAILABLE.
 */
export function selectCheckoutFlow(res: CreateFundingIntentResponse): CheckoutFlow {
  const { intent, checkout } = res
  if (intent.status === "SUCCEEDED" || intent.status === "PROCESSING") return { kind: "SETTLED", intentId: intent.id, status: intent.status }
  if (!checkout) return { kind: "UNAVAILABLE", reason: "The payment provider didn't return checkout details. Try again in a moment." }

  switch (checkout.provider) {
    case "TEST":
      return { kind: "TEST", intentId: intent.id, confirmPath: checkout.confirmPath || confirmTestPath(intent.id), total: intent.totalAmount }
    case "STRIPE":
      if (!checkout.publishableKey) return { kind: "UNAVAILABLE", reason: "Stripe isn't fully configured (missing publishable key). Ask an admin to finish the setup." }
      if (!checkout.clientSecret) return { kind: "UNAVAILABLE", reason: "Stripe didn't return a client secret for this payment. Try again in a moment." }
      return { kind: "STRIPE", intentId: intent.id, clientSecret: checkout.clientSecret, publishableKey: checkout.publishableKey, total: intent.totalAmount }
    case "RAZORPAY":
      if (!checkout.keyId) return { kind: "UNAVAILABLE", reason: "Razorpay isn't fully configured (missing key id). Ask an admin to finish the setup." }
      return { kind: "RAZORPAY", intentId: intent.id, orderId: checkout.orderId, keyId: checkout.keyId, amount: checkout.amount, currency: checkout.currency }
    default:
      return { kind: "UNAVAILABLE", reason: "This payment provider isn't supported in the browser yet." }
  }
}
