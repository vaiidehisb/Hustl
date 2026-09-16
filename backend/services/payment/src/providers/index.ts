import { errors } from "@hustl/common"
import type { PaymentProviderName } from "@hustl/contracts"
import { RazorpayAdapter } from "./razorpay"
import { StripeAdapter } from "./stripe"
import { TestAdapter } from "./test"
import type { PaymentProviderAdapter } from "./types"

export * from "./types"
export { TestAdapter, StripeAdapter, RazorpayAdapter }

const instances: Partial<Record<PaymentProviderName, PaymentProviderAdapter>> = {}

export function assertProviderAllowed(name: PaymentProviderName, nodeEnv = process.env.NODE_ENV) {
  if (name === "TEST" && nodeEnv === "production") throw new Error("PAYMENTS_PROVIDER=test is not allowed when NODE_ENV=production")
}

export function providerNameFromEnv(value = process.env.PAYMENTS_PROVIDER): PaymentProviderName {
  const v = (value ?? "").trim().toUpperCase()
  if (v === "STRIPE" || v === "RAZORPAY" || v === "TEST") return v
  throw errors.integrationUnavailable("Payments", ["PAYMENTS_PROVIDER"])
}

export function getProvider(name: PaymentProviderName): PaymentProviderAdapter {
  assertProviderAllowed(name)
  if (!instances[name]) instances[name] = name === "STRIPE" ? new StripeAdapter() : name === "RAZORPAY" ? new RazorpayAdapter() : new TestAdapter()
  return instances[name]!
}

/** The provider used for new funding intents and payout accounts. */
export const activeProvider = () => getProvider(providerNameFromEnv())
