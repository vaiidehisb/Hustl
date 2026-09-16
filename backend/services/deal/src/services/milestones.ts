import { createLogger, errors, publish, TOPICS, type AuthUser } from "@hustl/common"
import type { ReleaseMilestoneResponse, RequestRevisionRequest, SubmitMilestoneRequest } from "@hustl/contracts"
import { prisma, type Prisma } from "@hustl/db"
import { assertMilestoneTransition, SETTLED_MILESTONE_STATUSES, type Actor } from "../domain/deal-machine"
import { isOnTime } from "../domain/rules"
import { paymentClient } from "../lib/clients"
import { dealWithParties, lockDeal, partiesPayload, recordDealEvent, requireParty, transitionDeal, type DealWithParties, type Tx } from "../lib/deal-access"
import { recomputeCreatorStats } from "./stats"

const log = createLogger("deal-service:milestones")

function findMilestone(deal: DealWithParties, mid: string) {
  const m = deal.milestones.find((x) => x.id === mid)
  if (!m) throw errors.notFound("Milestone")
  return m
}

function assertInProgress(deal: DealWithParties, action: string) {
  if (deal.status !== "IN_PROGRESS") throw errors.conflict(`Milestones can only be ${action} while the deal is in progress`, { from: deal.status, action: action.toUpperCase() })
}

async function guardedMilestoneUpdate(tx: Tx, id: string, from: string, data: Prisma.MilestoneUpdateManyMutationInput, action: string) {
  const res = await tx.milestone.updateMany({ where: { id, status: from as never }, data })
  if (!res.count) throw errors.conflict("The milestone changed — reload and retry", { from, action })
}

export async function submitMilestone(user: AuthUser, dealId: string, mid: string, body: SubmitMilestoneRequest) {
  await prisma.$transaction(async (tx) => {
    const deal = await lockDeal(tx, dealId)
    const party = requireParty(deal, user)
    const m = findMilestone(deal, mid)
    assertMilestoneTransition(m.status, "SUBMIT", party)
    assertInProgress(deal, "submitted")
    if (deal.paymentMode !== "UPFRONT") {
      const blocking = deal.milestones.filter((x) => x.position < m.position && x.status !== "APPROVED" && x.status !== "RELEASED")
      if (blocking.length) throw errors.conflict("Complete earlier milestones first", { from: m.status, action: "SUBMIT", blockingMilestoneIds: blocking.map((b) => b.id) })
    }
    if (body.mediaAssetId) {
      const asset = await tx.mediaAsset.findUnique({ where: { id: body.mediaAssetId } })
      if (!asset || asset.ownerId !== user.id || (asset.dealId && asset.dealId !== dealId) || asset.status === "FAILED")
        throw errors.validation("Media asset not found or not yours", { fieldErrors: { mediaAssetId: ["Upload the deliverable first"] } })
    }
    const now = new Date()
    const submission = await tx.deliverable.create({ data: { milestoneId: m.id, url: body.url ?? null, mediaAssetId: body.mediaAssetId ?? null, note: body.note } })
    await guardedMilestoneUpdate(tx, m.id, m.status, { status: "SUBMITTED", submittedAt: now, revisionNote: null }, "SUBMIT")
    const onTime = isOnTime(m.dueDate, now)
    await recordDealEvent(tx, dealId, "MILESTONE_SUBMITTED", user.id, { milestoneId: m.id, deliverableId: submission.id, onTime, resubmission: m.status === "REVISION_REQUESTED" })
    await publish(tx, TOPICS.MILESTONE_SUBMITTED, dealId, { ...partiesPayload(deal), milestoneId: m.id, deliverableId: submission.id, title: m.title, dueDate: m.dueDate?.toISOString() ?? null, submittedAt: now.toISOString(), onTime })
  })
}

export async function requestRevision(user: AuthUser, dealId: string, mid: string, body: RequestRevisionRequest) {
  await prisma.$transaction(async (tx) => {
    const deal = await lockDeal(tx, dealId)
    const party = requireParty(deal, user)
    const m = findMilestone(deal, mid)
    assertMilestoneTransition(m.status, "REQUEST_REVISION", party)
    assertInProgress(deal, "reviewed")
    await guardedMilestoneUpdate(tx, m.id, m.status, { status: "REVISION_REQUESTED", revisionCount: { increment: 1 }, revisionNote: body.note }, "REQUEST_REVISION")
    await recordDealEvent(tx, dealId, "MILESTONE_REVISION_REQUESTED", user.id, { milestoneId: m.id, note: body.note, revisionCount: m.revisionCount + 1 })
    await publish(tx, TOPICS.MILESTONE_REVISION_REQUESTED, dealId, { ...partiesPayload(deal), milestoneId: m.id, title: m.title, note: body.note, revisionCount: m.revisionCount + 1 })
  })
}

/** Brand approval → APPROVED, then payment release. Re-approving an APPROVED milestone retries the release. */
export async function approveMilestone(user: AuthUser, dealId: string, mid: string) {
  await prisma.$transaction(async (tx) => {
    const deal = await lockDeal(tx, dealId)
    const party = requireParty(deal, user)
    const m = findMilestone(deal, mid)
    if (m.status === "APPROVED") {
      if (party !== "BRAND") throw errors.forbidden("Only the brand can approve deliverables")
      return
    }
    assertMilestoneTransition(m.status, "APPROVE", party)
    assertInProgress(deal, "approved")
    await guardedMilestoneUpdate(tx, m.id, m.status, { status: "APPROVED", approvedAt: new Date() }, "APPROVE")
    await recordDealEvent(tx, dealId, "MILESTONE_APPROVED", user.id, { milestoneId: m.id })
    await publish(tx, TOPICS.MILESTONE_APPROVED, dealId, { ...partiesPayload(deal), milestoneId: m.id, title: m.title, amount: m.amount })
  })
  return releaseViaPayment(dealId, mid, user.id)
}

/**
 * Asks payment-service to release an APPROVED milestone. On failure the milestone
 * stays APPROVED, a RELEASE_FAILED event is recorded and the error surfaces.
 */
export async function releaseViaPayment(dealId: string, mid: string, actorId: string | null) {
  let res: ReleaseMilestoneResponse
  try {
    res = await paymentClient().post<ReleaseMilestoneResponse>(`/internal/payments/milestones/${mid}/release`, {})
  } catch (err) {
    const e = err as { code?: string; message?: string }
    log.error({ err, dealId, milestoneId: mid }, "milestone release failed; milestone stays APPROVED")
    await prisma.dealEvent.create({ data: { dealId, actorId, type: "RELEASE_FAILED", data: { milestoneId: mid, code: e.code ?? "UNKNOWN", message: e.message ?? "Release failed" } } }).catch(() => undefined)
    throw err
  }
  // Apply now for a synchronous response; the milestone.payment_released consumer is idempotent.
  await applyMilestoneSettlement({ dealId, milestoneId: mid, kind: "RELEASE", payoutId: res.payout.id, gross: res.payout.gross, net: res.payout.net })
  return { payoutId: res.payout.id, status: res.payout.status, net: res.payout.net, alreadyReleased: res.alreadyReleased }
}

/** Brand-facing retry of a payout that failed after approval (UI action RETRY_RELEASE). */
export async function retryReleaseAsParty(user: AuthUser, dealId: string, mid: string) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: dealWithParties })
  if (!deal) throw errors.notFound("Deal")
  if (requireParty(deal, user) !== "BRAND") throw errors.forbidden("Only the brand can release a payment")
  return retryRelease(dealId, mid)
}

export async function retryRelease(dealId: string, mid: string) {
  const m = await prisma.milestone.findFirst({ where: { id: mid, dealId } })
  if (!m) throw errors.notFound("Milestone")
  if (m.status === "RELEASED") return { milestoneId: mid, status: m.status, alreadyReleased: true }
  if (m.status !== "APPROVED") throw errors.conflict("Only approved milestones can be released", { from: m.status, action: "RELEASE" })
  return { milestoneId: mid, ...(await releaseViaPayment(dealId, mid, null)) }
}

/**
 * Idempotent settlement of one milestone from payment events:
 * RELEASE → RELEASED, REFUND → REFUNDED (partial refunds of a split don't change status).
 * Then settles the deal when every milestone is RELEASED/REFUNDED.
 */
export async function applyMilestoneSettlement(p: { dealId: string; milestoneId: string; kind: "RELEASE" | "REFUND"; partial?: boolean; payoutId?: string; gross?: number; net?: number; amount?: number }) {
  await prisma.$transaction(async (tx) => {
    const deal = await lockDeal(tx, p.dealId).catch(() => null)
    if (!deal) return log.warn({ dealId: p.dealId }, "settlement event for unknown deal")
    const m = deal.milestones.find((x) => x.id === p.milestoneId)
    if (!m) return log.warn({ milestoneId: p.milestoneId }, "settlement event for unknown milestone")

    if (p.kind === "REFUND" && p.partial) {
      await recordDealEvent(tx, deal.id, "MILESTONE_PARTIAL_REFUND", null, { milestoneId: m.id, amount: p.amount })
    } else if (!SETTLED_MILESTONE_STATUSES.includes(m.status)) {
      const to = assertMilestoneTransition(m.status, p.kind, "SYSTEM" satisfies Actor)
      const now = new Date()
      await guardedMilestoneUpdate(tx, m.id, m.status, { status: to, ...(to === "RELEASED" && { releasedAt: now, approvedAt: m.approvedAt ?? now }) }, p.kind)
      m.status = to
      await recordDealEvent(tx, deal.id, to === "RELEASED" ? "MILESTONE_RELEASED" : "MILESTONE_REFUNDED", null, {
        milestoneId: m.id,
        ...(p.payoutId && { payoutId: p.payoutId, gross: p.gross, net: p.net }),
        ...(p.amount !== undefined && { amount: p.amount }),
      })
    }
    await settleDeal(tx, deal)
  })
}

export async function settleDeal(tx: Tx, deal: DealWithParties) {
  const milestones = await tx.milestone.findMany({ where: { dealId: deal.id } })
  const allSettled = milestones.length > 0 && milestones.every((m) => SETTLED_MILESTONE_STATUSES.includes(m.status))
  if (deal.status === "IN_PROGRESS" && allSettled) {
    const released = milestones.some((m) => m.status === "RELEASED")
    await transitionDeal(tx, deal, released ? "COMPLETE" : "CANCEL", "SYSTEM", {
      actorId: null,
      data: { reason: released ? "All milestones settled" : "All milestones refunded" },
      payload: { releasedAmount: milestones.filter((m) => m.status === "RELEASED").reduce((s, m) => s + m.amount, 0) },
    })
  }
  if (deal.status === "COMPLETED" || deal.status === "CANCELLED") await recomputeCreatorStats(tx, deal.creatorId)
}
