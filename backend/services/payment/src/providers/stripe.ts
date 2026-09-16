import Stripe from "stripe"
import { errors } from "@hustl/common"
import type { CheckoutDetails, SubscriptionCheckoutDetails, SubscriptionProductKey } from "@hustl/contracts"
import { toMinor, type CancelSubscriptionInput, type NormalizedInvoice, type NormalizedWebhookEvent, type PaymentProviderAdapter, type SubscriptionIntentInput } from "./types"

const API_VERSION = "2025-02-24.acacia" as const

function requireEnv(names: string[]) {
  const missing = names.filter((n) => !process.env[n])
  if (missing.length) throw errors.integrationUnavailable("Stripe", missing)
}

/** One recurring Price per catalog product, configured in the Stripe dashboard. */
export const stripePriceEnv = (product: SubscriptionProductKey) => `STRIPE_PRICE_${product}`

const secs = (v: number | null | undefined) => (typeof v === "number" && v > 0 ? new Date(v * 1000) : null)

/** checkoutRef packs the hosted page url and the Elements client secret into one stored string. */
export const joinCheckoutRef = (hostedUrl: string | null, clientSecret: string | null) => `${hostedUrl ?? ""}|${clientSecret ?? ""}`
export function splitCheckoutRef(ref: string | null): [hostedUrl: string | null, clientSecret: string | null] {
  if (!ref) return [null, null]
  // Older rows stored the bare client secret.
  if (!ref.includes("|")) return [null, ref]
  const [url, secret] = ref.split("|")
  return [url || null, secret || null]
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

      // ─── Subscriptions ─────────────────────────────────────────────────────
      case "invoice.paid":
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice & { subscription?: string | { id: string } | null }
        const subId = typeof inv.subscription === "string" ? inv.subscription : (inv.subscription?.id ?? null)
        if (!subId) return { ...base, kind: "ignored" }
        const invoice: NormalizedInvoice = {
          providerInvoiceId: inv.id ?? null,
          amountMinor: event.type === "invoice.paid" ? (inv.amount_paid ?? inv.total ?? null) : (inv.amount_due ?? inv.total ?? null),
          periodStart: secs(inv.period_start),
          periodEnd: secs(inv.period_end),
        }
        if (event.type === "invoice.payment_failed")
          return { ...base, kind: "subscription.payment_failed", providerSubscriptionId: subId, reason: inv.last_finalization_error?.message ?? "Subscription payment failed", invoice }
        return { ...base, kind: "subscription.paid", providerSubscriptionId: subId, periodStart: invoice.periodStart, periodEnd: invoice.periodEnd, invoice }
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription & { current_period_start?: number; current_period_end?: number }
        // Only an active subscription is an entitlement; incomplete/past_due are handled by the invoice events.
        if (sub.status !== "active" && sub.status !== "trialing") return { ...base, kind: "ignored" }
        return { ...base, kind: "subscription.paid", providerSubscriptionId: sub.id, periodStart: secs(sub.current_period_start), periodEnd: secs(sub.current_period_end), invoice: null }
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object
        return { ...base, kind: "subscription.cancelled", providerSubscriptionId: sub.id, at: secs(sub.canceled_at) ?? new Date() }
      }
      default:
        return { ...base, kind: "ignored" }
    }
  }

  // ─── Subscriptions ─────────────────────────────────────────────────────────

  /**
   * `checkoutRef` stores `<hostedUrl>|<clientSecret>`: the hosted page for the
   * redirect flow and the client secret for Elements, so either can be rebuilt
   * for a subscription whose checkout was abandoned.
   */
  subscriptionCheckoutFor(sub: { id: string; providerSubscriptionId: string; checkoutRef: string | null }): SubscriptionCheckoutDetails {
    const [hostedUrl, clientSecret] = splitCheckoutRef(sub.checkoutRef)
    return {
      provider: "STRIPE",
      subscriptionId: sub.providerSubscriptionId,
      hostedUrl,
      clientSecret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null,
    }
  }

  async createSubscription(input: SubscriptionIntentInput) {
    const priceEnv = stripePriceEnv(input.product)
    requireEnv(["STRIPE_SECRET_KEY", priceEnv])
    const api = this.api()
    // One customer per subscriber; the idempotency key keeps retries from duplicating it.
    const customer = await api.customers.create(
      { email: input.email, name: input.name, description: input.description, metadata: { subscriberRef: input.subscriberRef } },
      { idempotencyKey: `sub-cust:${input.subscriberRef}` },
    )
    const sub = await api.subscriptions.create(
      {
        customer: customer.id,
        items: [{ price: process.env[priceEnv]! }],
        payment_behavior: "default_incomplete",
        payment_settings: { save_default_payment_method: "on_subscription" },
        expand: ["latest_invoice.payment_intent"],
        metadata: { subscriptionId: input.subscriptionId, product: input.product, subscriberRef: input.subscriberRef },
      },
      { idempotencyKey: input.idempotencyKey },
    )
    const invoice = sub.latest_invoice as Stripe.Invoice | null
    const pi = (invoice as { payment_intent?: Stripe.PaymentIntent | string | null } | null)?.payment_intent
    const clientSecret = typeof pi === "object" && pi ? pi.client_secret : null
    // The subscription's first invoice carries a Stripe-hosted payment page. Paying it
    // activates this subscription and saves the mandate — so the redirect flow and the
    // Elements flow drive the same subscription id, and can never double-charge the way
    // a second `mode: "subscription"` Checkout Session would.
    const checkoutRef = joinCheckoutRef(invoice?.hosted_invoice_url ?? null, clientSecret)
    const period = sub as unknown as { current_period_start?: number; current_period_end?: number }
    return {
      providerSubscriptionId: sub.id,
      checkoutRef,
      checkout: this.subscriptionCheckoutFor({ id: input.subscriptionId, providerSubscriptionId: sub.id, checkoutRef }),
      currentPeriodStart: secs(period.current_period_start),
      currentPeriodEnd: secs(period.current_period_end),
    }
  }

  async cancelSubscription(input: CancelSubscriptionInput) {
    const api = this.api()
    if (input.atPeriodEnd) await api.subscriptions.update(input.providerSubscriptionId, { cancel_at_period_end: true })
    else await api.subscriptions.cancel(input.providerSubscriptionId)
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
