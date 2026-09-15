import Stripe from "stripe"
import { errors } from "@hustl/common"
import type { CheckoutDetails } from "@hustl/contracts"
import { toMinor, type NormalizedWebhookEvent, type PaymentProviderAdapter } from "./types"

const API_VERSION = "2025-02-24.acacia" as const

function requireEnv(names: string[]) {
  const missing = names.filter((n) => !process.env[n])
  if (missing.length) throw errors.integrationUnavailable("Stripe", missing)
}

export class StripeAdapter implements PaymentProviderAdapter {
  readonly name = "STRIPE" as const
  private client?: Stripe

  private api() {
    requireEnv(["STRIPE_SECRET_KEY"])
    this.client ??= new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: API_VERSION as Stripe.LatestApiVersion, maxNetworkRetries: 2, timeout: 20_000 })
    return this.client
  }

  checkoutFor(intent: { clientSecret: string }): CheckoutDetails {
    return { provider: "STRIPE", clientSecret: intent.clientSecret, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null }
  }

  async createFundingIntent(input: Parameters<PaymentProviderAdapter["createFundingIntent"]>[0]) {
    const pi = await this.api().paymentIntents.create(
      {
        amount: toMinor(input.amount),
        currency: input.currency.toLowerCase(),
        description: input.description,
        automatic_payment_methods: { enabled: true },
        transfer_group: `deal_${input.dealId}`,
        metadata: { dealId: input.dealId, intentId: input.intentId },
      },
      { idempotencyKey: input.idempotencyKey },
    )
    if (!pi.client_secret) throw errors.serviceUnavailable("Stripe")
    return { providerIntentId: pi.id, clientSecret: pi.client_secret, checkout: this.checkoutFor({ clientSecret: pi.client_secret }) }
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>) {
    requireEnv(["STRIPE_WEBHOOK_SECRET"])
    const sig = headers["stripe-signature"]
    if (typeof sig !== "string") throw errors.badRequest("Missing Stripe-Signature header")
    try {
      Stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!)
    } catch {
      throw errors.badRequest("Invalid Stripe webhook signature")
    }
  }

  parseWebhook(rawBody: Buffer): NormalizedWebhookEvent {
    const event = JSON.parse(rawBody.toString("utf8")) as Stripe.Event
    const base = { eventId: event.id, type: event.type }
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object
        return { ...base, kind: "funding.succeeded", providerIntentId: pi.id, paymentRef: pi.id, amountMinor: pi.amount_received }
      }
      case "payment_intent.payment_failed":
      case "payment_intent.canceled": {
        const pi = event.data.object
        return { ...base, kind: "funding.failed", providerIntentId: pi.id, reason: pi.last_payment_error?.message ?? event.type }
      }
      case "account.updated": {
        const acct = event.data.object
        const active = acct.details_submitted && acct.payouts_enabled && acct.capabilities?.transfers === "active"
        const restricted = !!acct.requirements?.disabled_reason
        return {
          ...base,
          kind: "account.updated",
          providerAccountId: acct.id,
          status: active ? "ACTIVE" : restricted ? "RESTRICTED" : "PENDING",
          detailsSubmitted: acct.details_submitted,
        }
      }
      case "transfer.reversed": {
        const tr = event.data.object
        return { ...base, kind: "transfer.failed", providerRef: tr.id, reason: "Transfer reversed" }
      }
      default:
        return { ...base, kind: "ignored" }
    }
  }

  async createPayoutAccountLink(input: Parameters<PaymentProviderAdapter["createPayoutAccountLink"]>[0]) {
    const api = this.api()
    const accountId =
      input.existingAccountId ??
      (
        await api.accounts.create(
          {
            type: "express",
            country: "IN",
            email: input.email,
            capabilities: { transfers: { requested: true } },
            business_profile: { name: input.name },
            metadata: { creatorId: input.creatorId },
          },
          { idempotencyKey: `acct:${input.creatorId}` },
        )
      ).id
    const acct = await api.accounts.retrieve(accountId)
    const active = acct.details_submitted && acct.payouts_enabled && acct.capabilities?.transfers === "active"
    const link = await api.accountLinks.create({ account: accountId, type: "account_onboarding", return_url: input.returnUrl, refresh_url: input.refreshUrl })
    return { accountId, url: link.url, status: active ? ("ACTIVE" as const) : ("PENDING" as const), detailsSubmitted: acct.details_submitted }
  }

  async transferToCreator(input: Parameters<PaymentProviderAdapter["transferToCreator"]>[0]) {
    const tr = await this.api().transfers.create(
      {
        amount: toMinor(input.amount),
        currency: input.currency.toLowerCase(),
        destination: input.accountId,
        transfer_group: `deal_${input.dealId}`,
        metadata: { dealId: input.dealId, payoutId: input.payoutId },
      },
      { idempotencyKey: input.idempotencyKey },
    )
    return { providerRef: tr.id, status: "PAID" as const }
  }

  async refund(input: Parameters<PaymentProviderAdapter["refund"]>[0]) {
    const rf = await this.api().refunds.create(
      { payment_intent: input.paymentRef, amount: toMinor(input.amount), metadata: { dealId: input.dealId } },
      { idempotencyKey: input.idempotencyKey },
    )
    return { providerRef: rf.id }
  }
}
