// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { CheckoutDetails, CreateFundingIntentResponse, PaymentIntentDTO, PaymentIntentStatus, PaymentProviderName } from "@hustl/contracts"
import { confirmTestPath, selectCheckoutFlow } from "@/components/deals/checkout"

const intent = (provider: PaymentProviderName, status: PaymentIntentStatus = "REQUIRES_PAYMENT"): PaymentIntentDTO => ({
  id: "11111111-1111-4111-8111-111111111111",
  dealId: "22222222-2222-4222-8222-222222222222",
  provider,
  status,
  escrowAmount: 30000,
  brandFee: 2400,
  processingFee: 600,
  totalAmount: 33000,
  currency: "INR",
  failureReason: null,
  createdAt: "2026-09-16T10:00:00.000Z",
  updatedAt: "2026-09-16T10:00:00.000Z",
})

const res = (provider: PaymentProviderName, checkout: CheckoutDetails | null, status?: PaymentIntentStatus): CreateFundingIntentResponse => ({
  intent: intent(provider, status),
  checkout,
})

describe("selectCheckoutFlow", () => {
  it("routes the TEST provider to its confirm path", () => {
    const flow = selectCheckoutFlow(res("TEST", { provider: "TEST", clientSecret: "cs_test", confirmPath: "/payments/intents/abc/confirm-test" }))
    expect(flow).toEqual({ kind: "TEST", intentId: intent("TEST").id, confirmPath: "/payments/intents/abc/confirm-test", total: 33000 })
  })

  it("falls back to the canonical confirm path when the provider omits it", () => {
    const flow = selectCheckoutFlow(res("TEST", { provider: "TEST", clientSecret: "cs_test", confirmPath: "" }))
    expect(flow.kind === "TEST" && flow.confirmPath).toBe(confirmTestPath(intent("TEST").id))
  })

  it("routes Stripe with its client secret and publishable key", () => {
    const flow = selectCheckoutFlow(res("STRIPE", { provider: "STRIPE", clientSecret: "pi_1_secret_x", publishableKey: "pk_test_123" }))
    expect(flow).toMatchObject({ kind: "STRIPE", clientSecret: "pi_1_secret_x", publishableKey: "pk_test_123" })
  })

  it("won't run Stripe without a publishable key", () => {
    const flow = selectCheckoutFlow(res("STRIPE", { provider: "STRIPE", clientSecret: "pi_1_secret_x", publishableKey: null }))
    expect(flow.kind).toBe("UNAVAILABLE")
    expect(flow.kind === "UNAVAILABLE" && flow.reason).toMatch(/publishable key/i)
  })

  it("routes Razorpay with the order id, key id and minor-unit amount", () => {
    const flow = selectCheckoutFlow(res("RAZORPAY", { provider: "RAZORPAY", orderId: "order_x", keyId: "rzp_test_1", amount: 3300000, currency: "INR" }))
    expect(flow).toMatchObject({ kind: "RAZORPAY", orderId: "order_x", keyId: "rzp_test_1", amount: 3300000, currency: "INR" })
  })

  it("won't open Razorpay without a key id", () => {
    const flow = selectCheckoutFlow(res("RAZORPAY", { provider: "RAZORPAY", orderId: "order_x", keyId: null, amount: 3300000, currency: "INR" }))
    expect(flow.kind).toBe("UNAVAILABLE")
  })

  it("treats an already-succeeded intent as settled instead of charging again", () => {
    const flow = selectCheckoutFlow(res("TEST", { provider: "TEST", clientSecret: "cs", confirmPath: "/x" }, "SUCCEEDED"))
    expect(flow).toMatchObject({ kind: "SETTLED", status: "SUCCEEDED" })
  })

  it("reports UNAVAILABLE when the backend returns no checkout details", () => {
    expect(selectCheckoutFlow(res("STRIPE", null)).kind).toBe("UNAVAILABLE")
  })
})
