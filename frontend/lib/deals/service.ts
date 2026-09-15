// Deal + payment services. All writes go through here so the state machine,
// the escrow ledger, the audit log and notifications stay consistent.

import "server-only"
import type { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import {
  DealTransitionError,
  DISPUTE_WINDOW_HOURS,
  MAX_NEGOTIATION_ROUNDS,
  nextStatus,
  type DealAction,
  type Party,
} from "./machine"
import { PLAN_BRAND_FEE, splitMilestones, UPFRONT_MIN_RELIABILITY, type MilestoneInput } from "@/lib/payments/fees"

type Tx = Prisma.TransactionClient
type Actor = { id: string; role: string | null }

const ref = (prefix: string) => `${prefix}_test_${Math.random().toString(36).slice(2, 12)}`

export async function notify(tx: Tx, userId: string, title: string, body = "", href?: string) {
  await tx.notification.create({ data: { userId, title, body, href } })
}

async function loadDeal(tx: Tx, dealId: string) {
  const deal = await tx.deal.findUnique({
    where: { id: dealId },
    include: { brand: { include: { user: true } }, creator: { include: { user: true } }, milestones: { orderBy: { order: "asc" } } },
  })
  if (!deal) throw new DealTransitionError("Deal not found.")
  return deal
}
type LoadedDeal = Awaited<ReturnType<typeof loadDeal>>

export function partyFor(deal: { brand: { userId: string }; creator: { userId: string } }, actor: Actor): Party {
  if (deal.brand.userId === actor.id) return "BRAND"
  if (deal.creator.userId === actor.id) return "CREATOR"
  if (actor.role === "ADMIN") return "ADMIN"
  throw new DealTransitionError("You are not a party to this deal.")
}

async function transition(tx: Tx, deal: LoadedDeal, action: DealAction, party: Party, actorId: string, note?: string) {
  const to = nextStatus(deal.status, action, party)
  const data: Prisma.DealUpdateInput = { status: to }
  if (to === "COMPLETED") data.completedAt = new Date()
  await tx.deal.update({ where: { id: deal.id }, data })
  await tx.dealEvent.create({ data: { dealId: deal.id, actorId, type: action, fromStatus: deal.status, toStatus: to, note } })
  deal.status = to
  return to
}

const counterpart = (deal: LoadedDeal, party: Party) => (party === "BRAND" ? deal.creator.userId : deal.brand.userId)
const dealHref = (deal: { id: string }, party: Party) => `/${party === "BRAND" ? "brand" : "creator"}/deals/${deal.id}`
const otherParty = (p: Party): Party => (p === "BRAND" ? "CREATOR" : "BRAND")

// ─── Offer & negotiation ─────────────────────────────────────────────────────

export type OfferInput = {
  creatorId: string
  briefId?: string | null
  applicationId?: string | null
  title: string
  amount: number
  paymentMode: "COMPLETION" | "UPFRONT" | "MILESTONES"
  milestones: MilestoneInput[]
  deliverables: string
  dueDate?: string | null
  message?: string
}

export async function createOffer(actor: Actor, input: OfferInput) {
  return db.$transaction(async (tx) => {
    const brand = await tx.brandProfile.findUnique({ where: { userId: actor.id }, include: { user: true } })
    if (!brand) throw new DealTransitionError("Only brands can send offers.")
    const creator = await tx.creatorProfile.findUnique({ where: { id: input.creatorId } })
    if (!creator) throw new DealTransitionError("Creator not found.")
    if (input.amount < 500) throw new DealTransitionError("Deal value must be at least ₹500.")
    if (input.paymentMode === "UPFRONT" && (creator.reliabilityScore <= UPFRONT_MIN_RELIABILITY || !brand.user.kycVerified))
      throw new DealTransitionError(`Upfront release needs a KYC-verified brand and creator reliability above ${UPFRONT_MIN_RELIABILITY}.`)

    const milestones = splitMilestones(input.amount, input.paymentMode === "MILESTONES" ? input.milestones : [{ title: input.paymentMode === "UPFRONT" ? "Upfront payment" : "Final delivery", percent: 100, dueDate: input.dueDate }])
    const ageDays = (Date.now() - brand.user.createdAt.getTime()) / 86_400_000
    const deal = await tx.deal.create({
      data: {
        title: input.title,
        briefId: input.briefId || null,
        applicationId: input.applicationId || null,
        brandId: brand.id,
        creatorId: creator.id,
        amount: input.amount,
        paymentMode: input.paymentMode,
        deliverables: input.deliverables,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        brandFeePct: PLAN_BRAND_FEE[brand.plan] ?? 0.08,
        // Fraud rule: new accounts posting high-value deals get a 24h hold.
        holdUntil: ageDays < 7 && input.amount >= 100_000 ? new Date(Date.now() + 86_400_000) : null,
        awaitingParty: "CREATOR",
        milestones: {
          create: milestones.map((m) => ({ order: m.order, title: m.title, percent: m.percent, amount: m.amount, dueDate: m.dueDate ? new Date(m.dueDate) : null })),
        },
      },
    })
    await tx.dealEvent.create({ data: { dealId: deal.id, actorId: actor.id, type: "OFFER", toStatus: "OFFER_SENT", note: input.message } })
    if (input.message) await tx.message.create({ data: { dealId: deal.id, senderId: actor.id, body: input.message } })
    if (input.applicationId) await tx.application.update({ where: { id: input.applicationId }, data: { status: "OFFERED" } })
    await notify(tx, creator.userId, `New offer from ${brand.companyName}`, `${input.title} · ₹${input.amount.toLocaleString("en-IN")}`, `/creator/deals/${deal.id}`)
    return deal
  })
}

export async function respondToOffer(
  actor: Actor,
  dealId: string,
  action: "ACCEPT" | "DECLINE" | "COUNTER",
  counter?: { amount: number; milestones: MilestoneInput[]; note?: string },
) {
  return db.$transaction(async (tx) => {
    const deal = await loadDeal(tx, dealId)
    const party = partyFor(deal, actor)
    if (party !== deal.awaitingParty) throw new DealTransitionError("It's the other party's turn to respond.")

    if (action === "COUNTER") {
      if (!counter) throw new DealTransitionError("Counter-offer details are required.")
      if (deal.negotiationRound >= MAX_NEGOTIATION_ROUNDS)
        throw new DealTransitionError(`Negotiation is limited to ${MAX_NEGOTIATION_ROUNDS} rounds — accept or decline.`)
      const milestones = splitMilestones(counter.amount, deal.paymentMode === "MILESTONES" ? counter.milestones : [{ title: deal.milestones[0]?.title ?? "Final delivery", percent: 100 }])
      await transition(tx, deal, "COUNTER", party, actor.id, `Countered at ₹${counter.amount.toLocaleString("en-IN")}${counter.note ? ` — ${counter.note}` : ""}`)
      await tx.milestone.deleteMany({ where: { dealId } })
      await tx.deal.update({
        where: { id: dealId },
        data: {
          amount: counter.amount,
          negotiationRound: { increment: 1 },
          awaitingParty: otherParty(party),
          milestones: { create: milestones.map((m) => ({ order: m.order, title: m.title, percent: m.percent, amount: m.amount })) },
        },
      })
      if (counter.note) await tx.message.create({ data: { dealId, senderId: actor.id, body: counter.note } })
      await notify(tx, counterpart(deal, party), "Counter-offer received", `${deal.title} · ₹${counter.amount.toLocaleString("en-IN")}`, dealHref(deal, otherParty(party)))
      return
    }

    await transition(tx, deal, action, party, actor.id)
    if (action === "DECLINE" && deal.applicationId)
      await tx.application.update({ where: { id: deal.applicationId }, data: { status: "REJECTED" } })
    await notify(
      tx,
      counterpart(deal, party),
      action === "ACCEPT" ? "Offer accepted — contract ready to sign" : "Offer declined",
      deal.title,
      dealHref(deal, otherParty(party)),
    )
  })
}

// ─── Contract ────────────────────────────────────────────────────────────────

export async function signContract(actor: Actor, dealId: string) {
  return db.$transaction(async (tx) => {
    const deal = await loadDeal(tx, dealId)
    const party = partyFor(deal, actor)
    nextStatus(deal.status, "SIGN", party) // validates state
    const field = party === "BRAND" ? "brandSignedAt" : "creatorSignedAt"
    if (deal[field]) throw new DealTransitionError("You have already signed this contract.")
    const updated = await tx.deal.update({ where: { id: dealId }, data: { [field]: new Date() } })
    await tx.dealEvent.create({ data: { dealId, actorId: actor.id, type: "SIGNED", note: `${party === "BRAND" ? deal.brand.companyName : deal.creator.user.name} signed` } })
    if (updated.brandSignedAt && updated.creatorSignedAt) {
      await transition(tx, deal, "SIGN", party, actor.id, "Contract fully executed")
      await notify(tx, deal.brand.userId, "Contract signed — fund escrow to start", deal.title, dealHref(deal, "BRAND"))
      await notify(tx, deal.creator.userId, "Contract signed", "Work starts once the brand funds escrow.", dealHref(deal, "CREATOR"))
    } else {
      await notify(tx, counterpart(deal, party), "Your signature is needed", deal.title, dealHref(deal, otherParty(party)))
    }
  })
}

// ─── Escrow ──────────────────────────────────────────────────────────────────

async function release(tx: Tx, deal: LoadedDeal, milestone: LoadedDeal["milestones"][number], actorId: string) {
  const fee = Math.round(milestone.amount * deal.creatorFeePct)
  await tx.transaction.createMany({
    data: [
      { dealId: deal.id, milestoneId: milestone.id, type: "RELEASE", amount: milestone.amount - fee, reference: ref("po") },
      { dealId: deal.id, milestoneId: milestone.id, type: "CREATOR_FEE", amount: fee, reference: ref("fee") },
    ],
  })
  await tx.milestone.update({ where: { id: milestone.id }, data: { status: "RELEASED", releasedAt: new Date(), approvedAt: milestone.approvedAt ?? new Date() } })
  await tx.dealEvent.create({ data: { dealId: deal.id, actorId, type: "PAYMENT_RELEASED", note: `${milestone.title} · ₹${(milestone.amount - fee).toLocaleString("en-IN")} paid out` } })
  milestone.status = "RELEASED"
  await notify(tx, deal.creator.userId, "Payment released 🎉", `₹${(milestone.amount - fee).toLocaleString("en-IN")} for “${milestone.title}”`, `/creator/earnings`)
}

export async function fundEscrow(actor: Actor, dealId: string) {
  return db.$transaction(async (tx) => {
    const deal = await loadDeal(tx, dealId)
    const party = partyFor(deal, actor)
    if (deal.holdUntil && deal.holdUntil > new Date())
      throw new DealTransitionError("This deal is on a 24h safety hold while we verify the account.")
    await transition(tx, deal, "FUND", party, actor.id)
    const brandFee = Math.round(deal.amount * deal.brandFeePct)
    const processing = Math.round(deal.amount * deal.processingFeePct)
    await tx.transaction.createMany({
      data: [
        { dealId, type: "ESCROW_FUND", amount: deal.amount, reference: ref("esc") },
        { dealId, type: "BRAND_FEE", amount: brandFee, reference: ref("fee") },
        { dealId, type: "PROCESSING_FEE", amount: processing, reference: ref("pg") },
      ],
    })
    await tx.deal.update({ where: { id: dealId }, data: { fundedAt: new Date() } })
    await transition(tx, deal, "START", party, actor.id, "Escrow secured — work can begin")
    if (deal.paymentMode === "UPFRONT") for (const m of deal.milestones) await release(tx, deal, m, actor.id)
    await notify(tx, deal.creator.userId, "Escrow funded — you're clear to start", `₹${deal.amount.toLocaleString("en-IN")} is locked for ${deal.title}`, dealHref(deal, "CREATOR"))
  })
}

// ─── Milestones ──────────────────────────────────────────────────────────────

async function loadMilestone(tx: Tx, milestoneId: string, actor: Actor) {
  const m = await tx.milestone.findUnique({ where: { id: milestoneId } })
  if (!m) throw new DealTransitionError("Milestone not found.")
  const deal = await loadDeal(tx, m.dealId)
  const milestone = deal.milestones.find((x) => x.id === milestoneId)!
  return { deal, milestone, party: partyFor(deal, actor) }
}

export async function submitMilestone(actor: Actor, milestoneId: string, submissionUrl: string, submissionNote: string) {
  return db.$transaction(async (tx) => {
    const { deal, milestone, party } = await loadMilestone(tx, milestoneId, actor)
    if (party !== "CREATOR") throw new DealTransitionError("Only the creator can submit deliverables.")
    if (deal.status !== "IN_PROGRESS") throw new DealTransitionError("Deliverables can be submitted once escrow is funded.")
    if (!["PENDING", "REVISION_REQUESTED"].includes(milestone.status)) throw new DealTransitionError("This milestone isn't awaiting a submission.")
    const earlier = deal.milestones.filter((x) => x.order < milestone.order && !["APPROVED", "RELEASED"].includes(x.status))
    if (earlier.length && deal.paymentMode !== "UPFRONT") throw new DealTransitionError("Finish earlier milestones first.")
    await tx.milestone.update({ where: { id: milestoneId }, data: { status: "SUBMITTED", submissionUrl, submissionNote, submittedAt: new Date(), revisionNote: null } })
    await tx.dealEvent.create({ data: { dealId: deal.id, actorId: actor.id, type: "MILESTONE_SUBMITTED", note: milestone.title } })
    await notify(tx, deal.brand.userId, "Deliverable ready for review", `${deal.creator.user.name} submitted “${milestone.title}”`, dealHref(deal, "BRAND"))
  })
}

async function maybeComplete(tx: Tx, deal: LoadedDeal, actorId: string) {
  const fresh = await tx.milestone.findMany({ where: { dealId: deal.id } })
  if (fresh.every((m) => ["RELEASED", "REFUNDED"].includes(m.status)) && deal.status === "IN_PROGRESS") {
    await transition(tx, deal, "COMPLETE", "BRAND", actorId, "All milestones settled")
    await tx.creatorProfile.update({ where: { id: deal.creatorId }, data: { completedDeals: { increment: 1 } } })
    await notify(tx, deal.creator.userId, "Deal complete ✅", `Leave a review for ${deal.brand.companyName}`, dealHref(deal, "CREATOR"))
    await notify(tx, deal.brand.userId, "Deal complete ✅", `Rate your experience with ${deal.creator.user.name}`, dealHref(deal, "BRAND"))
  }
}

export async function approveMilestone(actor: Actor, milestoneId: string) {
  return db.$transaction(async (tx) => {
    const { deal, milestone, party } = await loadMilestone(tx, milestoneId, actor)
    if (party !== "BRAND") throw new DealTransitionError("Only the brand can approve deliverables.")
    if (deal.status === "DISPUTED") throw new DealTransitionError("Releases are frozen while a dispute is open.")
    if (milestone.status !== "SUBMITTED") throw new DealTransitionError("Only submitted milestones can be approved.")
    await tx.milestone.update({ where: { id: milestoneId }, data: { status: "APPROVED", approvedAt: new Date() } })
    await tx.dealEvent.create({ data: { dealId: deal.id, actorId: actor.id, type: "MILESTONE_APPROVED", note: milestone.title } })
    milestone.approvedAt = new Date()
    await release(tx, deal, milestone, actor.id)
    await maybeComplete(tx, deal, actor.id)
  })
}

export async function requestRevision(actor: Actor, milestoneId: string, note: string) {
  return db.$transaction(async (tx) => {
    const { deal, milestone, party } = await loadMilestone(tx, milestoneId, actor)
    if (party !== "BRAND") throw new DealTransitionError("Only the brand can request revisions.")
    if (milestone.status !== "SUBMITTED") throw new DealTransitionError("Only submitted milestones can be sent back.")
    await tx.milestone.update({ where: { id: milestoneId }, data: { status: "REVISION_REQUESTED", revisionNote: note } })
    await tx.dealEvent.create({ data: { dealId: deal.id, actorId: actor.id, type: "REVISION_REQUESTED", note: `${milestone.title}: ${note}` } })
    await notify(tx, deal.creator.userId, "Revision requested", note, dealHref(deal, "CREATOR"))
  })
}

// ─── Disputes ────────────────────────────────────────────────────────────────

export async function raiseDispute(actor: Actor, dealId: string, reason: string, milestoneId?: string | null) {
  return db.$transaction(async (tx) => {
    const deal = await loadDeal(tx, dealId)
    const party = partyFor(deal, actor)
    const milestone = milestoneId ? deal.milestones.find((m) => m.id === milestoneId) : deal.milestones.find((m) => m.status === "SUBMITTED")
    if (milestone?.submittedAt && Date.now() - milestone.submittedAt.getTime() > DISPUTE_WINDOW_HOURS * 3_600_000)
      throw new DealTransitionError(`Disputes must be raised within ${DISPUTE_WINDOW_HOURS}h of a submission.`)
    await transition(tx, deal, "DISPUTE", party, actor.id, reason)
    await tx.dispute.create({ data: { dealId, milestoneId: milestone?.id, raisedById: actor.id, reason } })
    await tx.transaction.updateMany({ where: { dealId, status: "PENDING" }, data: { status: "FROZEN" } })
    if (milestone) await tx.milestone.update({ where: { id: milestone.id }, data: { status: "DISPUTED" } })
    await notify(tx, counterpart(deal, party), "A dispute was raised", `${deal.title}: ${reason}`, dealHref(deal, otherParty(party)))
    const admins = await tx.user.findMany({ where: { role: "ADMIN" }, select: { id: true } })
    for (const a of admins) await notify(tx, a.id, "New dispute to review", deal.title, "/admin")
  })
}

export async function resolveDispute(actor: Actor, disputeId: string, resolution: "RELEASE_TO_CREATOR" | "REFUND_TO_BRAND", adminNote: string) {
  if (actor.role !== "ADMIN") throw new DealTransitionError("Only admins can resolve disputes.")
  return db.$transaction(async (tx) => {
    const dispute = await tx.dispute.findUnique({ where: { id: disputeId } })
    if (!dispute || dispute.status !== "OPEN") throw new DealTransitionError("Dispute is not open.")
    const deal = await loadDeal(tx, dispute.dealId)
    await transition(tx, deal, "RESOLVE", "ADMIN", actor.id, `${resolution === "RELEASE_TO_CREATOR" ? "Released to creator" : "Refunded to brand"} — ${adminNote}`)
    const milestone = deal.milestones.find((m) => m.id === dispute.milestoneId)
    if (milestone) {
      if (resolution === "RELEASE_TO_CREATOR") await release(tx, deal, milestone, actor.id)
      else {
        await tx.transaction.create({ data: { dealId: deal.id, milestoneId: milestone.id, type: "REFUND", amount: milestone.amount, reference: ref("rf") } })
        await tx.milestone.update({ where: { id: milestone.id }, data: { status: "REFUNDED" } })
      }
    }
    await tx.dispute.update({ where: { id: disputeId }, data: { status: "RESOLVED", resolution, adminNote, resolvedAt: new Date() } })
    await maybeComplete(tx, deal, actor.id)
    for (const p of ["BRAND", "CREATOR"] as Party[])
      await notify(tx, p === "BRAND" ? deal.brand.userId : deal.creator.userId, "Dispute resolved", adminNote, dealHref(deal, p))
  })
}

export async function cancelDeal(actor: Actor, dealId: string) {
  return db.$transaction(async (tx) => {
    const deal = await loadDeal(tx, dealId)
    const party = partyFor(deal, actor)
    await transition(tx, deal, "CANCEL", party, actor.id)
    if (party !== "ADMIN") await notify(tx, counterpart(deal, party), "Deal cancelled", deal.title, dealHref(deal, otherParty(party)))
  })
}

// ─── Messaging & reviews ─────────────────────────────────────────────────────

export async function sendMessage(actor: Actor, dealId: string, body: string) {
  const text = body.trim()
  if (!text) return
  return db.$transaction(async (tx) => {
    const deal = await loadDeal(tx, dealId)
    const party = partyFor(deal, actor)
    await tx.message.create({ data: { dealId, senderId: actor.id, body: text.slice(0, 4000) } })
    if (party !== "ADMIN") await notify(tx, counterpart(deal, party), `New message · ${deal.title}`, text.slice(0, 120), `${dealHref(deal, otherParty(party))}?tab=messages`)
  })
}

export async function leaveReview(actor: Actor, dealId: string, rating: number, comment: string) {
  return db.$transaction(async (tx) => {
    const deal = await loadDeal(tx, dealId)
    const party = partyFor(deal, actor)
    if (deal.status !== "COMPLETED") throw new DealTransitionError("Reviews open once the deal is complete.")
    const subjectUserId = party === "BRAND" ? deal.creator.userId : deal.brand.userId
    await tx.review.create({ data: { dealId, authorId: actor.id, subjectUserId, rating: Math.max(1, Math.min(5, rating)), comment } })
    if (party === "BRAND") {
      const agg = await tx.review.aggregate({ where: { subjectUserId }, _avg: { rating: true } })
      await tx.creatorProfile.update({ where: { id: deal.creatorId }, data: { avgRating: agg._avg.rating ?? rating } })
    }
  })
}
