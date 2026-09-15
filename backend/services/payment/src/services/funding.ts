import { randomUUID } from "node:crypto"
import { createLogger, errors, publish, TOPICS, type AuthUser } from "@hustl/common"
import { fundingBreakdown, type CreateFundingIntentResponse } from "@hustl/contracts"
import { prisma, Prisma, type PaymentProvider } from "@hustl/db"
import { toEscrowSummary, toIntentDTO } from "../lib/dto"
import { activeProvider, getProvider, TestAdapter, type NormalizedWebhookEvent } from "../providers"
import { retryHeldPayouts } from "./release"

const log = createLogger("payment-service:funding")

export async function createFundingIntent(user: AuthUser, dealId: string, attempt = 0): Promise<CreateFundingIntentResponse> {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: { brand: { select: { userId: true, companyName: true } }, escrow: true } })
  if (!deal) throw errors.notFound("Deal")
  if (deal.brand.userId !== user.id) throw errors.forbidden("Only the brand on this deal can fund escrow")
  if (deal.status !== "CONTRACT_SIGNED") throw errors.conflict("Escrow can be funded once both parties have signed the contract", { from: deal.status, action: "FUND" })
  if (deal.holdUntil && deal.holdUntil > new Date())
    throw errors.conflict("This deal is on a safety hold while we verify the account", { holdUntil: deal.holdUntil.toISOString(), reason: "FRAUD_HOLD" })
  if (deal.escrow && deal.escrow.fundedAmount > 0) throw errors.conflict("Escrow is already funded for this deal", { escrowStatus: deal.escrow.status })

  const b = fundingBreakdown(deal.amount, deal.brandFeeRate, deal.processingFeeRate)
  const key = `fund:${dealId}`
  const provider = activeProvider()
  const description = `hustl. escrow — ${deal.title}`.slice(0, 200)
  const existing = await prisma.paymentIntent.findUnique({ where: { idempotencyKey: key } })

  if (existing) {
    if (existing.status === "SUCCEEDED") throw errors.conflict("Escrow is already funded for this deal", { intentId: existing.id })
    const reusable =
      (existing.status === "REQUIRES_PAYMENT" || existing.status === "PROCESSING") &&
      existing.provider === provider.name &&
      existing.totalAmount === b.total &&
      existing.providerIntentId &&
      existing.clientSecret
    if (reusable) {
      const checkout = getProvider(existing.provider).checkoutFor({ id: existing.id, providerIntentId: existing.providerIntentId!, clientSecret: existing.clientSecret!, totalAmount: existing.totalAmount, currency: existing.currency })
      return { intent: toIntentDTO(existing), checkout }
    }
    // Failed/cancelled, or terms/provider changed: open a fresh provider intent on the same row.
    const res = await provider.createFundingIntent({ dealId, intentId: existing.id, amount: b.total, currency: deal.currency, idempotencyKey: `${key}:${Date.now()}`, description })
    const intent = await prisma.$transaction(async (tx) => {
      const row = await tx.paymentIntent.update({
        where: { id: existing.id },
        data: { provider: provider.name, providerIntentId: res.providerIntentId, clientSecret: res.clientSecret, status: "REQUIRES_PAYMENT", escrowAmount: b.escrow, brandFee: b.brandFee, processingFee: b.processingFee, totalAmount: b.total, failureReason: null },
      })
      await upsertFundingEscrow(tx, dealId, provider.name)
      return row
    })
    return { intent: toIntentDTO(intent), checkout: res.checkout }
  }

  const intentId = randomUUID()
  const res = await provider.createFundingIntent({ dealId, intentId, amount: b.total, currency: deal.currency, idempotencyKey: key, description })
  try {
    const intent = await prisma.$transaction(async (tx) => {
      const row = await tx.paymentIntent.create({
        data: { id: intentId, dealId, provider: provider.name, providerIntentId: res.providerIntentId, clientSecret: res.clientSecret, status: "REQUIRES_PAYMENT", escrowAmount: b.escrow, brandFee: b.brandFee, processingFee: b.processingFee, totalAmount: b.total, currency: deal.currency, idempotencyKey: key },
      })
      await upsertFundingEscrow(tx, dealId, provider.name)
      return row
    })
    return { intent: toIntentDTO(intent), checkout: res.checkout }
  } catch (err) {
    // A concurrent request created the intent first — return that one.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && attempt === 0) return createFundingIntent(user, dealId, 1)
    throw err
  }
}

async function upsertFundingEscrow(tx: Prisma.TransactionClient, dealId: string, provider: PaymentProvider) {
  const escrow = await tx.escrowAccount.findUnique({ where: { dealId } })
  if (!escrow) await tx.escrowAccount.create({ data: { dealId, provider, status: "FUNDING" } })
  else if (escrow.fundedAmount === 0) await tx.escrowAccount.update({ where: { id: escrow.id }, data: { provider, status: "FUNDING" } })
}

export type ProcessResult = { duplicate: boolean; kind: NormalizedWebhookEvent["kind"]; outcome: string }

/**
 * Single code path for verified provider events (webhooks and confirm-test).
 * Deduplicated on provider_webhook_events (provider, eventId); state change,
 * ledger and outbox events commit in one transaction.
 */
export async function processProviderEvent(provider: PaymentProvider, event: NormalizedWebhookEvent, raw: unknown): Promise<ProcessResult> {
  const seen = await prisma.providerWebhookEvent.findUnique({ where: { provider_eventId: { provider, eventId: event.eventId } } })
  if (seen?.processedAt) return { duplicate: true, kind: event.kind, outcome: "duplicate" }

  let followUp: { retryPayoutsFor?: string } = {}
  let outcome = "ignored"
  try {
    await prisma.$transaction(async (tx) => {
      const row = seen ?? (await tx.providerWebhookEvent.create({ data: { provider, eventId: event.eventId, type: event.type, payload: (raw ?? {}) as Prisma.InputJsonValue } }))

      switch (event.kind) {
        case "funding.succeeded": {
          const intent = await tx.paymentIntent.findUnique({ where: { provider_providerIntentId: { provider, providerIntentId: event.providerIntentId } } })
          if (!intent) {
            outcome = "unknown_intent"
            log.warn({ provider, providerIntentId: event.providerIntentId }, "funding event for unknown intent")
            break
          }
          if (event.amountMinor != null && event.amountMinor !== intent.totalAmount * 100) {
            outcome = "amount_mismatch"
            log.error({ intentId: intent.id, expected: intent.totalAmount * 100, got: event.amountMinor }, "funding amount mismatch; escrow not funded")
            await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: "FAILED", failureReason: `Amount mismatch: expected ${intent.totalAmount * 100}, received ${event.amountMinor}` } })
            break
          }
          const claimed = await tx.paymentIntent.updateMany({ where: { id: intent.id, status: { not: "SUCCEEDED" } }, data: { status: "SUCCEEDED", failureReason: null } })
          if (claimed.count === 0) {
            outcome = "already_succeeded"
            break
          }
          const escrow = await tx.escrowAccount.findUnique({ where: { dealId: intent.dealId } })
          if (escrow) await tx.escrowAccount.update({ where: { id: escrow.id }, data: { provider, status: "FUNDED", fundedAmount: intent.escrowAmount } })
          else await tx.escrowAccount.create({ data: { dealId: intent.dealId, provider, status: "FUNDED", fundedAmount: intent.escrowAmount } })
          await tx.ledgerEntry.createMany({
            data: [
              { dealId: intent.dealId, type: "ESCROW_FUND", amount: intent.escrowAmount, provider, providerRef: event.paymentRef },
              { dealId: intent.dealId, type: "BRAND_FEE", amount: intent.brandFee, provider, providerRef: event.paymentRef },
              { dealId: intent.dealId, type: "PROCESSING_FEE", amount: intent.processingFee, provider, providerRef: event.paymentRef },
            ],
          })
          await publish(tx, TOPICS.PAYMENT_FUNDED, intent.dealId, {
            dealId: intent.dealId,
            intentId: intent.id,
            provider,
            escrowAmount: intent.escrowAmount,
            brandFee: intent.brandFee,
            processingFee: intent.processingFee,
            totalAmount: intent.totalAmount,
          })
          outcome = "funded"
          break
        }
        case "funding.failed": {
          const res = await tx.paymentIntent.updateMany({
            where: { provider, providerIntentId: event.providerIntentId, status: { in: ["REQUIRES_PAYMENT", "PROCESSING"] } },
            data: { status: "FAILED", failureReason: event.reason.slice(0, 500) },
          })
          outcome = res.count ? "failed" : "no_change"
          break
        }
        case "account.updated": {
          const account = await tx.payoutAccount.findFirst({ where: { provider, providerAccountId: event.providerAccountId } })
          if (!account) {
            outcome = "unknown_account"
            break
          }
          await tx.payoutAccount.update({ where: { id: account.id }, data: { status: event.status, detailsSubmitted: event.detailsSubmitted } })
          if (event.status === "ACTIVE") followUp = { retryPayoutsFor: account.creatorId }
          outcome = `account_${event.status.toLowerCase()}`
          break
        }
        case "transfer.failed": {
          const res = await tx.payout.updateMany({ where: { provider, providerRef: event.providerRef }, data: { status: "FAILED", failureReason: event.reason.slice(0, 500), paidAt: null } })
          outcome = res.count ? "payout_failed" : "unknown_transfer"
          break
        }
        case "ignored":
          break
      }
      await tx.providerWebhookEvent.update({ where: { id: row.id }, data: { processedAt: new Date() } })
    })
  } catch (err) {
    // The same event is being processed concurrently; the other request owns it.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { duplicate: true, kind: event.kind, outcome: "duplicate" }
    throw err
  }
  if (followUp.retryPayoutsFor) await retryHeldPayouts(followUp.retryPayoutsFor).catch((err) => log.error({ err }, "retrying held payouts failed"))
  return { duplicate: false, kind: event.kind, outcome }
}

export async function handleWebhook(provider: "STRIPE" | "RAZORPAY", rawBody: unknown, headers: Record<string, string | string[] | undefined>) {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) throw errors.badRequest("Webhook body is required")
  const adapter = getProvider(provider)
  adapter.verifyWebhook(rawBody, headers)
  let event: NormalizedWebhookEvent
  let raw: unknown
  try {
    raw = JSON.parse(rawBody.toString("utf8"))
    event = adapter.parseWebhook(rawBody, headers)
  } catch {
    throw errors.badRequest("Malformed webhook payload")
  }
  return processProviderEvent(provider, event, raw)
}

/** Sandbox only: simulate the provider's success webhook through the same processing path. */
export async function confirmTestIntent(user: AuthUser, intentId: string) {
  const intent = await prisma.paymentIntent.findUnique({ where: { id: intentId }, include: { deal: { include: { brand: { select: { userId: true } } } } } })
  if (!intent) throw errors.notFound("Payment intent")
  if (intent.deal.brand.userId !== user.id) throw errors.forbidden("Only the brand on this deal can confirm its payment")
  if (intent.provider !== "TEST") throw errors.conflict("confirm-test is only available for test-provider intents", { provider: intent.provider })
  if (!intent.providerIntentId) throw errors.conflict("Intent has no provider reference")
  const adapter = getProvider("TEST") as TestAdapter
  const event = adapter.successEvent({ id: intent.id, providerIntentId: intent.providerIntentId, totalAmount: intent.totalAmount })
  const result = await processProviderEvent("TEST", event, { simulated: true, ...event })
  const [fresh, escrow] = await Promise.all([
    prisma.paymentIntent.findUniqueOrThrow({ where: { id: intentId } }),
    prisma.escrowAccount.findUnique({ where: { dealId: intent.dealId } }),
  ])
  return { intent: toIntentDTO(fresh), escrow: toEscrowSummary(intent.deal, escrow), duplicate: result.duplicate, outcome: result.outcome }
}
