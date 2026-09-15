import type { FastifyInstance, FastifyRequest } from "fastify"
import { authenticate, ok, parse, requireInternal, requireRole } from "@hustl/common"
import {
  adminDisputesQuery,
  dealIdParams,
  idParams,
  internalCreateDisputeRequest,
  ledgerQuery,
  milestoneIdParams,
  onboardingLinkRequest,
  payoutsQuery,
  resolveDisputeRequest,
} from "@hustl/contracts"
import { createDispute, freezeEscrow, listDisputes, resolveDispute } from "./services/disputes"
import { confirmTestIntent, createFundingIntent, handleWebhook } from "./services/funding"
import { brandLedger, createOnboardingLink, creatorPayouts, dealPayments, getPayoutAccount, paymentSummary } from "./services/queries"
import { releaseMilestone } from "./services/release"

const user = (req: FastifyRequest) => req.user!

export async function registerRoutes(app: FastifyInstance) {
  // ─── Funding ──────────────────────────────────────────────────────────────
  app.post("/payments/deals/:dealId/intent", { preHandler: authenticate }, async (req) => {
    const { dealId } = parse(dealIdParams, req.params)
    return ok(await createFundingIntent(user(req), dealId))
  })

  app.post("/payments/intents/:id/confirm-test", { preHandler: authenticate }, async (req) => {
    const { id } = parse(idParams, req.params)
    return ok(await confirmTestIntent(user(req), id))
  })

  // ─── Webhooks (raw body, signature-verified, deduplicated) ───────────────
  app.post("/payments/webhooks/stripe", async (req) => ok(await handleWebhook("STRIPE", req.body, req.headers)))
  app.post("/payments/webhooks/razorpay", async (req) => ok(await handleWebhook("RAZORPAY", req.body, req.headers)))

  // ─── Reads ────────────────────────────────────────────────────────────────
  app.get("/payments/deals/:dealId", { preHandler: authenticate }, async (req) => {
    const { dealId } = parse(dealIdParams, req.params)
    return ok(await dealPayments(user(req), dealId))
  })

  app.get("/payments/me/ledger", { preHandler: requireRole("BRAND") }, async (req) => {
    const { items, meta } = await brandLedger(user(req), parse(ledgerQuery, req.query))
    return ok(items, meta)
  })

  app.get("/payments/me/payouts", { preHandler: requireRole("CREATOR") }, async (req) => {
    const { items, meta } = await creatorPayouts(user(req), parse(payoutsQuery, req.query))
    return ok(items, meta)
  })

  app.get("/payments/me/summary", { preHandler: requireRole("BRAND", "CREATOR") }, async (req) => ok(await paymentSummary(user(req))))

  app.get("/payments/payout-account", { preHandler: requireRole("CREATOR") }, async (req) => ok(await getPayoutAccount(user(req))))

  app.post("/payments/payout-account/onboarding-link", { preHandler: requireRole("CREATOR") }, async (req) =>
    ok(await createOnboardingLink(user(req), parse(onboardingLinkRequest, req.body ?? {}))),
  )

  // ─── Admin ────────────────────────────────────────────────────────────────
  app.get("/admin/disputes", { preHandler: requireRole("ADMIN") }, async (req) => {
    const { items, meta } = await listDisputes(parse(adminDisputesQuery, req.query))
    return ok(items, meta)
  })

  app.post("/admin/disputes/:id/resolve", { preHandler: requireRole("ADMIN") }, async (req) => {
    const { id } = parse(idParams, req.params)
    return ok(await resolveDispute(user(req), id, parse(resolveDisputeRequest, req.body)))
  })

  // ─── Internal (blocked at the gateway) ───────────────────────────────────
  app.post("/internal/payments/milestones/:milestoneId/release", { preHandler: requireInternal }, async (req) => {
    const { milestoneId } = parse(milestoneIdParams, req.params)
    return ok(await releaseMilestone(milestoneId))
  })

  app.post("/internal/payments/deals/:dealId/freeze", { preHandler: requireInternal }, async (req) => {
    const { dealId } = parse(dealIdParams, req.params)
    return ok(await freezeEscrow(dealId))
  })

  app.post("/internal/payments/disputes", { preHandler: requireInternal }, async (req, reply) => {
    const result = await createDispute(parse(internalCreateDisputeRequest, req.body))
    return reply.status(result.created ? 201 : 200).send(ok(result))
  })
}
