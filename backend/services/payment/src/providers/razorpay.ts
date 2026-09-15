import { createHmac, timingSafeEqual } from "node:crypto"
import Razorpay from "razorpay"
import { errors } from "@hustl/common"
import type { CheckoutDetails } from "@hustl/contracts"
import { toMinor, type NormalizedWebhookEvent, type PaymentProviderAdapter } from "./types"

function requireEnv(names: string[]) {
  const missing = names.filter((n) => !process.env[n])
  if (missing.length) throw errors.integrationUnavailable("Razorpay", missing)
}

/** Razorpay webhook signature: hex HMAC-SHA256 of the raw body with the webhook secret. */
export function razorpaySignature(rawBody: Buffer | string, secret: string) {
  return createHmac("sha256", secret).update(rawBody).digest("hex")
}

type RzpWebhook = {
  event: string
  account_id?: string
  created_at?: number
  payload: {
    payment?: { entity: { id: string; order_id: string | null; amount: number; status: string; error_description?: string | null } }
    order?: { entity: { id: string; amount_paid: number } }
    account?: { entity: { id: string; status?: string } }
    transfer?: { entity: { id: string; error?: { description?: string } } }
  }
}

export class RazorpayAdapter implements PaymentProviderAdapter {
  readonly name = "RAZORPAY" as const
  private client?: Razorpay

  private api() {
    requireEnv(["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"])
    this.client ??= new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID!, key_secret: process.env.RAZORPAY_KEY_SECRET! })
    return this.client
  }

  checkoutFor(intent: { providerIntentId: string; totalAmount: number; currency: string }): CheckoutDetails {
    return { provider: "RAZORPAY", orderId: intent.providerIntentId, keyId: process.env.RAZORPAY_KEY_ID ?? null, amount: toMinor(intent.totalAmount), currency: intent.currency }
  }

  async createFundingIntent(input: Parameters<PaymentProviderAdapter["createFundingIntent"]>[0]) {
    const order = await this.api().orders.create({
      amount: toMinor(input.amount),
      currency: input.currency,
      // receipt is limited to 40 chars
      receipt: `fund_${input.intentId.replace(/-/g, "").slice(0, 32)}`,
      notes: { dealId: input.dealId, intentId: input.intentId, idempotencyKey: input.idempotencyKey },
    })
    return {
      providerIntentId: order.id,
      clientSecret: order.id,
      checkout: this.checkoutFor({ providerIntentId: order.id, totalAmount: input.amount, currency: input.currency }),
    }
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>) {
    requireEnv(["RAZORPAY_WEBHOOK_SECRET"])
    const sig = headers["x-razorpay-signature"]
    if (typeof sig !== "string" || !/^[a-f0-9]{64}$/i.test(sig)) throw errors.badRequest("Missing or malformed X-Razorpay-Signature header")
    const expected = Buffer.from(razorpaySignature(rawBody, process.env.RAZORPAY_WEBHOOK_SECRET!), "hex")
    const given = Buffer.from(sig, "hex")
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw errors.badRequest("Invalid Razorpay webhook signature")
  }

  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): NormalizedWebhookEvent {
    const body = JSON.parse(rawBody.toString("utf8")) as RzpWebhook
    const headerId = headers["x-razorpay-event-id"]
    const payment = body.payload?.payment?.entity
    const order = body.payload?.order?.entity
    // Razorpay sends a unique event id header; fall back to a stable derived id.
    const derived = `${body.event}:${payment?.id ?? order?.id ?? body.payload?.account?.entity?.id ?? body.payload?.transfer?.entity?.id ?? body.created_at}`
    const base = { eventId: typeof headerId === "string" && headerId ? headerId : derived, type: body.event }

    switch (body.event) {
      case "order.paid":
      case "payment.captured": {
        const orderId = order?.id ?? payment?.order_id
        if (!orderId || !payment) return { ...base, kind: "ignored" }
        return { ...base, kind: "funding.succeeded", providerIntentId: orderId, paymentRef: payment.id, amountMinor: order?.amount_paid ?? payment.amount }
      }
      case "payment.failed": {
        if (!payment?.order_id) return { ...base, kind: "ignored" }
        return { ...base, kind: "funding.failed", providerIntentId: payment.order_id, reason: payment.error_description ?? "Payment failed" }
      }
      case "account.activated":
      case "account.under_review":
      case "account.needs_clarification":
      case "account.suspended":
      case "account.rejected": {
        const id = body.payload?.account?.entity?.id ?? body.account_id
        if (!id) return { ...base, kind: "ignored" }
        const status = body.event === "account.activated" ? "ACTIVE" : body.event === "account.suspended" || body.event === "account.rejected" ? "RESTRICTED" : "PENDING"
        return { ...base, kind: "account.updated", providerAccountId: id, status, detailsSubmitted: body.event !== "account.needs_clarification" }
      }
      case "transfer.failed":
      case "transfer.reversed": {
        const tr = body.payload?.transfer?.entity
        if (!tr) return { ...base, kind: "ignored" }
        return { ...base, kind: "transfer.failed", providerRef: tr.id, reason: tr.error?.description ?? body.event }
      }
      default:
        return { ...base, kind: "ignored" }
    }
  }

  async createPayoutAccountLink(input: Parameters<PaymentProviderAdapter["createPayoutAccountLink"]>[0]) {
    const api = this.api()
    if (input.existingAccountId) {
      const acct = await api.accounts.fetch(input.existingAccountId)
      return { accountId: acct.id, url: null, status: acct.status === "activated" ? ("ACTIVE" as const) : ("PENDING" as const), detailsSubmitted: true }
    }
    const d = input.razorpay
    if (!d)
      throw errors.validation("Razorpay linked accounts need business details", {
        fieldErrors: { razorpay: ["phone, address (street1, city, state, postalCode) are required for Razorpay Route onboarding"] },
      })
    const acct = await api.accounts.create({
      email: input.email,
      phone: d.phone,
      type: "route",
      reference_id: input.creatorId.replace(/-/g, "").slice(0, 20),
      legal_business_name: d.legalBusinessName ?? input.name,
      business_type: d.businessType,
      contact_name: input.name,
      profile: {
        category: d.category,
        subcategory: d.subcategory,
        addresses: {
          registered: { street1: d.address.street1, street2: d.address.street2 ?? "", city: d.address.city, state: d.address.state, postal_code: d.address.postalCode, country: d.address.country },
        },
      },
    } as Parameters<Razorpay["accounts"]["create"]>[0])
    return { accountId: acct.id, url: null, status: acct.status === "activated" ? ("ACTIVE" as const) : ("PENDING" as const), detailsSubmitted: true }
  }

  async transferToCreator(input: Parameters<PaymentProviderAdapter["transferToCreator"]>[0]) {
    const tr = await this.api().transfers.create({
      account: input.accountId,
      amount: toMinor(input.amount),
      currency: input.currency,
      notes: { dealId: input.dealId, payoutId: input.payoutId, idempotencyKey: input.idempotencyKey },
    })
    return { providerRef: tr.id, status: tr.status === "processed" ? ("PAID" as const) : ("PENDING" as const) }
  }

  async refund(input: Parameters<PaymentProviderAdapter["refund"]>[0]) {
    const rf = await this.api().payments.refund(input.paymentRef, {
      amount: toMinor(input.amount),
      speed: "normal",
      notes: { dealId: input.dealId, idempotencyKey: input.idempotencyKey },
      receipt: input.idempotencyKey.slice(0, 40),
    })
    return { providerRef: rf.id }
  }
}
