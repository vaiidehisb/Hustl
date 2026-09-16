import { createLogger, errors, type AuthUser, type EventEnvelope } from "@hustl/common"
import { DISPUTE_WINDOW_HOURS, type CreateDisputeRequest, type DisputeDTO, type MilestoneStatus } from "@hustl/contracts"
import { prisma } from "@hustl/db"
import { assertTransition, MILESTONE_TRANSITIONS, SETTLED_MILESTONE_STATUSES } from "../domain/deal-machine"
import { paymentClient } from "../lib/clients"
import { lockDeal, requireParty, transitionDeal } from "../lib/deal-access"
import { releaseViaPayment, settleDeal } from "./milestones"
import { recomputeCreatorStats } from "./stats"

const log = createLogger("deal-service:disputes")

export async function raiseDispute(user: AuthUser, dealId: string, body: CreateDisputeRequest) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: { brand: { select: { userId: true } }, creator: { select: { userId: true } }, milestones: true } })
  if (!deal) throw errors.notFound("Deal")
  const party = requireParty(deal, user)
  assertTransition(deal.status, "DISPUTE", party)

  if (body.milestoneId) {
    const m = deal.milestones.find((x) => x.id === body.milestoneId)
    if (!m) throw errors.notFound("Milestone")
    if (SETTLED_MILESTONE_STATUSES.includes(m.status)) throw errors.conflict("This milestone is already settled", { from: m.status, action: "DISPUTE" })
    const latest = await prisma.deliverable.findFirst({ where: { milestoneId: m.id }, orderBy: { createdAt: "desc" } })
    const since = latest?.createdAt ?? m.submittedAt
    if (since && Date.now() - since.getTime() > DISPUTE_WINDOW_HOURS * 3_600_000)
      throw errors.conflict(`Disputes must be raised within ${DISPUTE_WINDOW_HOURS}h of the latest submission`, {
        from: deal.status,
        action: "DISPUTE",
        windowHours: DISPUTE_WINDOW_HOURS,
        latestSubmissionAt: since.toISOString(),
      })
  }
  if (body.evidenceIds.length) {
    const owned = await prisma.mediaAsset.count({ where: { id: { in: body.evidenceIds }, ownerId: user.id } })
    if (owned !== new Set(body.evidenceIds).size) throw errors.validation("Evidence files must be uploaded by you", { fieldErrors: { evidenceIds: ["Unknown or foreign media asset"] } })
  }

  // Payment-service creates the dispute and freezes escrow (idempotent per deal).
  const res = await paymentClient().post<{ dispute: DisputeDTO; created: boolean }>("/internal/payments/disputes", {
    dealId,
    milestoneId: body.milestoneId ?? null,
    raisedById: user.id,
    reason: body.reason,
    evidenceIds: body.evidenceIds,
  })

  await prisma.$transaction(async (tx) => {
    const locked = await lockDeal(tx, dealId)
    if (locked.status === "DISPUTED") return
    const targets = res.dispute.milestoneId ? locked.milestones.filter((m) => m.id === res.dispute.milestoneId) : locked.milestones
    const disputed: string[] = []
    for (const m of targets) {
      if (!MILESTONE_TRANSITIONS[m.status].DISPUTE) continue
      await tx.milestone.updateMany({ where: { id: m.id, status: m.status }, data: { status: "DISPUTED" } })
      disputed.push(m.id)
    }
    await transitionDeal(tx, locked, "DISPUTE", party, {
      actorId: user.id,
      data: { disputeId: res.dispute.id, milestoneId: res.dispute.milestoneId, milestoneIds: disputed, reason: body.reason },
      payload: { disputeId: res.dispute.id, milestoneId: res.dispute.milestoneId, reason: body.reason },
    })
  })
  return res.dispute
}

type ResolvedPayload = { dealId: string; disputeId: string; milestoneId: string | null; resolution: "RELEASE_TO_CREATOR" | "REFUND_TO_BRAND" | "SPLIT"; settledMilestoneIds?: string[] }

/**
 * `dispute.resolved` → IN_PROGRESS, or COMPLETED/CANCELLED when every milestone is
 * (or is being) settled. Milestone RELEASED/REFUNDED statuses arrive via the
 * payment events, in either order; both paths converge.
 */
export async function onDisputeResolved(event: EventEnvelope) {
  const p = event.payload as unknown as ResolvedPayload
  let reopened = false
  let approvedToRetry: string[] = []
  await prisma.$transaction(async (tx) => {
    const deal = await lockDeal(tx, p.dealId).catch(() => null)
    if (!deal || deal.status !== "DISPUTED") return
    const settling = new Set(p.settledMilestoneIds ?? (p.milestoneId ? [p.milestoneId] : []))
    const effective = deal.milestones.map((m): MilestoneStatus =>
      SETTLED_MILESTONE_STATUSES.includes(m.status) ? m.status : settling.has(m.id) ? (p.resolution === "REFUND_TO_BRAND" ? "REFUNDED" : "RELEASED") : m.status,
    )
    const data = { disputeId: p.disputeId, resolution: p.resolution }
    if (effective.every((s) => SETTLED_MILESTONE_STATUSES.includes(s))) {
      const released = effective.includes("RELEASED")
      await transitionDeal(tx, deal, released ? "COMPLETE" : "CANCEL", "SYSTEM", { actorId: null, data, payload: data })
      await recomputeCreatorStats(tx, deal.creatorId)
    } else {
      await transitionDeal(tx, deal, "RESOLVE", "SYSTEM", { actorId: null, data, payload: data })
      await settleDeal(tx, deal)
      reopened = (deal.status as MilestoneStatus | string) === "IN_PROGRESS"
      approvedToRetry = deal.milestones.filter((m) => m.status === "APPROVED").map((m) => m.id)
    }
  })
  // Releases blocked by the freeze can go through now (best effort; brand can re-approve).
  if (reopened)
    for (const mid of approvedToRetry) await releaseViaPayment(p.dealId, mid, null).catch((err) => log.warn({ err, milestoneId: mid }, "post-dispute release retry failed"))
}
