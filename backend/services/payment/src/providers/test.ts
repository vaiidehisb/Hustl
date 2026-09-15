// Explicit sandbox provider for local development and automated tests.
// Every reference is prefixed `test_` so it can never be mistaken for real money.
// Refused when NODE_ENV=production (see providers/index.ts).

import { randomBytes } from "node:crypto"
import { errors } from "@hustl/common"
import type { CheckoutDetails } from "@hustl/contracts"
import type { NormalizedWebhookEvent, PaymentProviderAdapter } from "./types"

const ref = (kind: string) => `test_${kind}_${randomBytes(9).toString("hex")}`

export class TestAdapter implements PaymentProviderAdapter {
  readonly name = "TEST" as const

  checkoutFor(intent: { id: string; clientSecret: string }): CheckoutDetails {
    return { provider: "TEST", clientSecret: intent.clientSecret, confirmPath: `/payments/intents/${intent.id}/confirm-test` }
  }

  async createFundingIntent(input: Parameters<PaymentProviderAdapter["createFundingIntent"]>[0]) {
    const providerIntentId = ref("pi")
    const clientSecret = `${providerIntentId}_secret_${randomBytes(6).toString("hex")}`
    return { providerIntentId, clientSecret, checkout: this.checkoutFor({ id: input.intentId, clientSecret }) }
  }

  /** The sandbox never receives webhooks over HTTP; confirm-test builds the event in-process. */
  verifyWebhook(): void {
    throw errors.badRequest("The test provider does not accept webhooks; use POST /payments/intents/:id/confirm-test")
  }

  parseWebhook(): NormalizedWebhookEvent {
    throw errors.badRequest("The test provider does not accept webhooks")
  }

  /** Simulated provider success event for an intent (used by confirm-test). */
  successEvent(intent: { id: string; providerIntentId: string; totalAmount: number }): NormalizedWebhookEvent {
    return {
      kind: "funding.succeeded",
      eventId: `test_evt_${intent.id}`,
      type: "test.payment_succeeded",
      providerIntentId: intent.providerIntentId,
      paymentRef: `test_pay_${intent.providerIntentId.slice(8)}`,
      amountMinor: intent.totalAmount * 100,
    }
  }

  async createPayoutAccountLink(input: Parameters<PaymentProviderAdapter["createPayoutAccountLink"]>[0]) {
    return { accountId: input.existingAccountId ?? ref("acct"), url: `${input.returnUrl}${input.returnUrl.includes("?") ? "&" : "?"}test_onboarding=complete`, status: "ACTIVE" as const, detailsSubmitted: true }
  }

  async transferToCreator() {
    return { providerRef: ref("tr"), status: "PAID" as const }
  }

  async refund() {
    return { providerRef: ref("rf") }
  }
}
