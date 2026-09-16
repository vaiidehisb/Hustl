import { describe, expect, it } from "vitest"
import { brandFeeRateForPlan, fundingBreakdown, payoutBreakdown } from "@hustl/contracts"
import { disputeSplit, settledEscrowStatus } from "../src/domain/escrow"
import { assertProviderAllowed, providerNameFromEnv } from "../src/providers"
import { RazorpayAdapter, razorpaySignature } from "../src/providers/razorpay"
import { toMinor } from "../src/providers/types"

describe("fee math", () => {
  it("funding = escrow + brand fee + processing", () => {
    expect(fundingBreakdown(10_000, brandFeeRateForPlan("STARTER"))).toEqual({ escrow: 10_000, brandFee: 800, processingFee: 200, total: 11_000 })
    expect(fundingBreakdown(10_000, brandFeeRateForPlan("GROWTH"))).toEqual({ escrow: 10_000, brandFee: 500, processingFee: 200, total: 10_700 })
    expect(fundingBreakdown(12_345, 0.05)).toEqual({ escrow: 12_345, brandFee: 617, processingFee: 247, total: 13_209 })
    expect(brandFeeRateForPlan("UNKNOWN")).toBe(0.08)
  })

  it("payout = gross − 5% creator fee", () => {
    expect(payoutBreakdown(6000)).toEqual({ gross: 6000, fee: 300, net: 5700 })
    expect(payoutBreakdown(3333)).toEqual({ gross: 3333, fee: 167, net: 3166 })
  })

  it("converts rupees to paise", () => expect(toMinor(11_000)).toBe(1_100_000))
})

describe("escrow status", () => {
  it("derives status from amounts", () => {
    expect(settledEscrowStatus({ fundedAmount: 0, releasedAmount: 0, refundedAmount: 0 })).toBe("UNFUNDED")
    expect(settledEscrowStatus({ fundedAmount: 100, releasedAmount: 0, refundedAmount: 0 })).toBe("FUNDED")
    expect(settledEscrowStatus({ fundedAmount: 100, releasedAmount: 30, refundedAmount: 0 })).toBe("PARTIALLY_RELEASED")
    expect(settledEscrowStatus({ fundedAmount: 100, releasedAmount: 60, refundedAmount: 40 })).toBe("RELEASED")
    expect(settledEscrowStatus({ fundedAmount: 100, releasedAmount: 0, refundedAmount: 100 })).toBe("REFUNDED")
  })

  it("splits disputed amounts exactly", () => {
    expect(disputeSplit(1000, "RELEASE_TO_CREATOR")).toEqual({ creatorGross: 1000, brandRefund: 0 })
    expect(disputeSplit(1000, "REFUND_TO_BRAND")).toEqual({ creatorGross: 0, brandRefund: 1000 })
    expect(disputeSplit(999, "SPLIT", 33)).toEqual({ creatorGross: 330, brandRefund: 669 })
    expect(() => disputeSplit(1000, "SPLIT", 100)).toThrow()
  })
})

describe("providers", () => {
  it("refuses the test provider in production", () => {
    expect(() => assertProviderAllowed("TEST", "production")).toThrow(/not allowed/)
    expect(() => assertProviderAllowed("TEST", "development")).not.toThrow()
    expect(() => assertProviderAllowed("STRIPE", "production")).not.toThrow()
  })

  it("parses PAYMENTS_PROVIDER and reports missing config", () => {
    expect(providerNameFromEnv("razorpay")).toBe("RAZORPAY")
    expect(() => providerNameFromEnv("")).toThrow(/not configured/)
  })

  it("verifies Razorpay webhook HMAC-SHA256 signatures", () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "unit_secret"
    const rzp = new RazorpayAdapter()
    const body = Buffer.from(JSON.stringify({ event: "order.paid", payload: {} }))
    expect(() => rzp.verifyWebhook(body, { "x-razorpay-signature": razorpaySignature(body, "unit_secret") })).not.toThrow()
    expect(() => rzp.verifyWebhook(body, { "x-razorpay-signature": razorpaySignature(body, "wrong") })).toThrow(/Invalid/)
    expect(() => rzp.verifyWebhook(body, {})).toThrow(/Missing/)
  })

  it("throws integrationUnavailable listing missing Razorpay credentials", async () => {
    delete process.env.RAZORPAY_KEY_ID
    delete process.env.RAZORPAY_KEY_SECRET
    const rzp = new RazorpayAdapter()
    await expect(rzp.createFundingIntent({ dealId: "d", intentId: "i", amount: 1, currency: "INR", idempotencyKey: "k", description: "x" })).rejects.toMatchObject({
      code: "INTEGRATION_UNAVAILABLE",
      details: { integration: "Razorpay", missingEnv: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"] },
    })
  })
})
