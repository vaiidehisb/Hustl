// Event consumer: turns business events into in-app notifications (+ email for
// high-value events) and keeps conversations in sync with the deal pipeline.
// Payload ids are resolved against the DB; handlers are idempotent.

import { AppError, TOPICS, type EventEnvelope, type Topic } from "@hustl/common"
import { prisma } from "@hustl/db"
import { ensureConversation } from "./conversations"
import { deliverNotifications, type NotificationInput } from "./notifications"
import { pushUnread } from "./realtime"
import * as t from "./templates"
import type { Audience, DealFacts, NotificationDraft } from "./templates"

type Log = { warn: (obj: object, msg: string) => void; info?: (obj: object, msg: string) => void }
type Party = "brand" | "creator"
type Payload = Record<string, unknown>

export const NOTIFICATION_TOPICS: Topic[] = [
  TOPICS.USER_KYC_VERIFIED,
  TOPICS.APPLICATION_SUBMITTED,
  TOPICS.APPLICATION_STATUS_CHANGED,
  TOPICS.OFFER_SENT,
  TOPICS.OFFER_COUNTERED,
  TOPICS.OFFER_ACCEPTED,
  TOPICS.OFFER_DECLINED,
  TOPICS.CONTRACT_SIGNED,
  TOPICS.DEAL_FUNDED,
  TOPICS.DEAL_STATUS_CHANGED,
  TOPICS.MILESTONE_SUBMITTED,
  TOPICS.MILESTONE_APPROVED,
  TOPICS.MILESTONE_REVISION_REQUESTED,
  TOPICS.DEAL_COMPLETED,
  TOPICS.PAYMENT_RELEASED,
  TOPICS.PAYMENT_REFUNDED,
  TOPICS.DISPUTE_OPENED,
  TOPICS.DISPUTE_RESOLVED,
  TOPICS.MESSAGE_SENT,
  TOPICS.FRAUD_FLAGGED,
]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const str = (p: Payload, ...keys: string[]) => {
  for (const k of keys) if (typeof p[k] === "string" && (p[k] as string).length) return p[k] as string
  return null
}
const id = (p: Payload, key: string | null, ...keys: string[]) => {
  const v = str(p, ...keys)
  if (v && UUID.test(v)) return v
  return key && UUID.test(key) ? key : null
}
const num = (p: Payload, ...keys: string[]) => {
  for (const k of keys) {
    const v = p[k]
    if (typeof v === "number" && Number.isFinite(v)) return v
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
  }
  return null
}
const asParty = (v: unknown): Party | null => (typeof v === "string" && /^(brand|creator)$/i.test(v) ? (v.toLowerCase() as Party) : null)
const other = (p: Party): Party => (p === "brand" ? "creator" : "brand")

// ─── Resolution ──────────────────────────────────────────────────────────────

type DealCtx = { facts: DealFacts; brandUserId: string; creatorUserId: string; amount: number; status: string; cancelledAt: Date | null }

async function loadDeal(dealId: string | null): Promise<DealCtx | null> {
  if (!dealId) return null
  const d = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      id: true,
      title: true,
      amount: true,
      status: true,
      cancelledAt: true,
      brand: { select: { userId: true, companyName: true } },
      creator: { select: { userId: true, handle: true, user: { select: { name: true } } } },
    },
  })
  if (!d) return null
  return {
    facts: { id: d.id, title: d.title, brandName: d.brand.companyName, creatorName: d.creator.user.name || `@${d.creator.handle}` },
    brandUserId: d.brand.userId,
    creatorUserId: d.creator.userId,
    amount: d.amount,
    status: d.status,
    cancelledAt: d.cancelledAt,
  }
}

/** The acting party, from explicit payload fields only. */
function actorParty(p: Payload, deal: DealCtx, partyKeys: string[], userKeys: string[]): Party | null {
  for (const k of partyKeys) {
    const party = asParty(p[k])
    if (party) return party
  }
  for (const k of userKeys) {
    if (p[k] === deal.brandUserId) return "brand"
    if (p[k] === deal.creatorUserId) return "creator"
  }
  return null
}

async function latestOfferProposer(dealId: string): Promise<Party | null> {
  const offer = await prisma.dealOffer.findFirst({ where: { dealId }, orderBy: { round: "desc" }, select: { proposedBy: true } })
  return offer ? asParty(offer.proposedBy) : null
}

let adminCache: { ids: string[]; at: number } | undefined
async function adminIds() {
  if (adminCache && Date.now() - adminCache.at < 60_000) return adminCache.ids
  const admins = await prisma.user.findMany({ where: { role: "ADMIN", status: "ACTIVE", deletedAt: null }, select: { id: true } })
  adminCache = { ids: admins.map((a) => a.id), at: Date.now() }
  return adminCache.ids
}
/** Test hook: admin membership changes should be visible immediately. */
export const resetAdminCache = () => {
  adminCache = undefined
}

async function toInputs(drafts: NotificationDraft[], audiences: Partial<Record<Audience, string[]>>): Promise<NotificationInput[]> {
  const out: NotificationInput[] = []
  for (const d of drafts) {
    const userIds = d.audience === "admin" ? (audiences.admin ?? (await adminIds())) : (audiences[d.audience] ?? [])
    for (const userId of userIds) out.push({ userId, title: d.title, body: d.body, href: d.href, email: d.email })
  }
  return out
}

const dealAudiences = (deal: DealCtx) => ({ brand: [deal.brandUserId], creator: [deal.creatorUserId] })

// ─── Handler ─────────────────────────────────────────────────────────────────

/** Build the notification drafts for an event (and run side effects such as ensuring conversations). */
async function draftsFor(event: EventEnvelope, log: Log): Promise<{ drafts: NotificationDraft[]; audiences: Partial<Record<Audience, string[]>> } | null> {
  const p = (event.payload ?? {}) as Payload
  const skip = (what: string) => {
    log.warn({ eventId: event.id, topic: event.topic, key: event.key }, `${what} not found; skipping notification`)
    return null
  }

  switch (event.topic) {
    case TOPICS.APPLICATION_SUBMITTED:
    case TOPICS.APPLICATION_STATUS_CHANGED: {
      const applicationId = id(p, event.key, "applicationId")
      const app = applicationId
        ? await prisma.application.findUnique({
            where: { id: applicationId },
            select: {
              id: true,
              status: true,
              briefId: true,
              brief: { select: { title: true, brand: { select: { userId: true, companyName: true } } } },
              creator: { select: { userId: true, handle: true, user: { select: { name: true } } } },
            },
          })
        : null
      if (!app) return skip("Application")
      const audiences = { brand: [app.brief.brand.userId], creator: [app.creator.userId] }
      if (event.topic === TOPICS.APPLICATION_SUBMITTED) {
        return { audiences, drafts: t.applicationSubmitted({ briefId: app.briefId, briefTitle: app.brief.title, creatorName: app.creator.user.name || `@${app.creator.handle}` }) }
      }
      const status = (str(p, "status", "to", "toStatus", "newStatus") ?? app.status).toUpperCase()
      if (status === "SHORTLISTED") await ensureConversation({ applicationId: app.id })
      return { audiences, drafts: t.applicationStatusChanged({ status, briefTitle: app.brief.title, brandName: app.brief.brand.companyName }) }
    }

    case TOPICS.OFFER_SENT: {
      const deal = await loadDeal(id(p, event.key, "dealId"))
      if (!deal) return skip("Deal")
      await ensureConversation({ dealId: deal.facts.id })
      return { audiences: dealAudiences(deal), drafts: t.offerSent({ ...deal.facts, amount: num(p, "amount") ?? deal.amount }) }
    }

    case TOPICS.OFFER_COUNTERED: {
      const deal = await loadDeal(id(p, event.key, "dealId"))
      if (!deal) return skip("Deal")
      const by =
        actorParty(p, deal, ["party", "proposedBy", "counteredBy", "by", "actorParty"], ["actorId", "userId", "proposedById", "counteredById"]) ??
        (await latestOfferProposer(deal.facts.id))
      if (!by) return skip("Counter-offer proposer")
      return { audiences: dealAudiences(deal), drafts: t.offerCountered({ ...deal.facts, counteredBy: by, amount: num(p, "amount") }) }
    }

    case TOPICS.OFFER_ACCEPTED:
    case TOPICS.OFFER_DECLINED: {
      const deal = await loadDeal(id(p, event.key, "dealId"))
      if (!deal) return skip("Deal")
      const accepted = event.topic === TOPICS.OFFER_ACCEPTED
      const explicit = actorParty(
        p,
        deal,
        ["party", "by", "actorParty", accepted ? "acceptedBy" : "declinedBy"],
        ["actorId", "userId", accepted ? "acceptedById" : "declinedById"],
      )
      // Otherwise the responder is the counterpart of whoever proposed the latest offer.
      const proposer = explicit ? null : await latestOfferProposer(deal.facts.id)
      const by = explicit ?? (proposer ? other(proposer) : null)
      if (!by) return skip("Offer responder")
      return {
        audiences: dealAudiences(deal),
        drafts: accepted ? t.offerAccepted({ ...deal.facts, acceptedBy: by }) : t.offerDeclined({ ...deal.facts, declinedBy: by }),
      }
    }

    case TOPICS.CONTRACT_SIGNED: {
      const deal = await loadDeal(id(p, event.key, "dealId"))
      if (!deal) return skip("Deal")
      const contract = await prisma.contract.findUnique({ where: { dealId: deal.facts.id }, select: { brandSignedAt: true, creatorSignedAt: true } })
      // Evaluate signatures as of the event, so a lagging consumer doesn't report both events as "fully signed".
      const asOf = new Date(event.createdAt).getTime() + 2000
      const signed = (d: Date | null | undefined) => !!d && d.getTime() <= asOf
      let pending: Party[]
      if (contract) {
        pending = [!signed(contract.brandSignedAt) && "brand", !signed(contract.creatorSignedAt) && "creator"].filter(Boolean) as Party[]
      } else {
        const signer = actorParty(p, deal, ["party", "signedBy", "by"], ["actorId", "userId", "signerId"])
        if (!signer) return skip("Contract")
        pending = [other(signer)]
      }
      if (pending.length === 2) return skip("Contract signature")
      return { audiences: dealAudiences(deal), drafts: t.contractSigned({ ...deal.facts, pending }) }
    }

    case TOPICS.DEAL_FUNDED: {
      const deal = await loadDeal(id(p, event.key, "dealId"))
      if (!deal) return skip("Deal")
      return { audiences: dealAudiences(deal), drafts: t.dealFunded({ ...deal.facts, amount: num(p, "amount", "fundedAmount", "escrowAmount") ?? deal.amount }) }
    }

    case TOPICS.DEAL_STATUS_CHANGED: {
      const status = str(p, "to", "toStatus", "status", "newStatus")?.toUpperCase()
      if (status && status !== "CANCELLED") return { audiences: {}, drafts: [] }
      const deal = await loadDeal(id(p, event.key, "dealId"))
      if (!deal) return skip("Deal")
      if (!status && deal.status !== "CANCELLED") return { audiences: {}, drafts: [] }
      return { audiences: dealAudiences(deal), drafts: t.dealCancelled(deal.facts) }
    }

    case TOPICS.MILESTONE_SUBMITTED:
    case TOPICS.MILESTONE_APPROVED:
    case TOPICS.MILESTONE_REVISION_REQUESTED:
    case TOPICS.PAYMENT_RELEASED: {
      const milestoneId = str(p, "milestoneId")
      const milestone =
        milestoneId && UUID.test(milestoneId)
          ? await prisma.milestone.findUnique({ where: { id: milestoneId }, select: { id: true, title: true, dealId: true, revisionNote: true } })
          : null
      const deal = await loadDeal(id(p, null, "dealId") ?? milestone?.dealId ?? (UUID.test(event.key) ? event.key : null))
      if (!deal) return skip("Deal")
      const milestoneTitle = str(p, "milestoneTitle") ?? milestone?.title ?? null
      const audiences = dealAudiences(deal)
      if (event.topic === TOPICS.MILESTONE_SUBMITTED) return { audiences, drafts: t.milestoneSubmitted({ ...deal.facts, milestoneTitle }) }
      if (event.topic === TOPICS.MILESTONE_APPROVED) return { audiences, drafts: t.milestoneApproved({ ...deal.facts, milestoneTitle }) }
      if (event.topic === TOPICS.MILESTONE_REVISION_REQUESTED)
        return { audiences, drafts: t.milestoneRevisionRequested({ ...deal.facts, milestoneTitle, note: str(p, "note", "revisionNote") ?? milestone?.revisionNote ?? null }) }

      let net = num(p, "net", "netAmount", "amountNet")
      if (net == null) {
        const payoutId = id(p, null, "payoutId")
        const payout = payoutId
          ? await prisma.payout.findUnique({ where: { id: payoutId }, select: { net: true } })
          : milestone
            ? await prisma.payout.findUnique({ where: { milestoneId: milestone.id }, select: { net: true } })
            : null
        net = payout?.net ?? null
      }
      return { audiences, drafts: t.paymentReleased({ ...deal.facts, net, milestoneTitle }) }
    }

    case TOPICS.PAYMENT_REFUNDED: {
      const deal = await loadDeal(id(p, event.key, "dealId"))
      if (!deal) return skip("Deal")
      return { audiences: dealAudiences(deal), drafts: t.paymentRefunded({ ...deal.facts, amount: num(p, "amount", "refundedAmount") }) }
    }

    case TOPICS.DEAL_COMPLETED: {
      const deal = await loadDeal(id(p, event.key, "dealId"))
      if (!deal) return skip("Deal")
      return { audiences: dealAudiences(deal), drafts: t.dealCompleted(deal.facts) }
    }

    case TOPICS.DISPUTE_OPENED:
    case TOPICS.DISPUTE_RESOLVED: {
      const disputeId = str(p, "disputeId")
      const dispute =
        disputeId && UUID.test(disputeId)
          ? await prisma.dispute.findUnique({ where: { id: disputeId }, select: { dealId: true, raisedById: true, reason: true, resolution: true, splitCreatorPercent: true } })
          : null
      const deal = await loadDeal(id(p, null, "dealId") ?? dispute?.dealId ?? (UUID.test(event.key) ? event.key : null))
      if (!deal) return skip("Deal")
      const audiences = { ...dealAudiences(deal), admin: await adminIds() }
      if (event.topic === TOPICS.DISPUTE_OPENED) {
        const raisedById = str(p, "raisedById", "actorId", "userId") ?? dispute?.raisedById
        const raisedBy = raisedById === deal.brandUserId ? "brand" : raisedById === deal.creatorUserId ? "creator" : asParty(p.raisedBy)
        return { audiences, drafts: t.disputeOpened({ ...deal.facts, raisedBy, reason: str(p, "reason") ?? dispute?.reason ?? null }) }
      }
      return {
        audiences,
        drafts: t.disputeResolved({
          ...deal.facts,
          resolution: str(p, "resolution") ?? dispute?.resolution ?? null,
          splitCreatorPercent: num(p, "splitCreatorPercent") ?? dispute?.splitCreatorPercent ?? null,
        }),
      }
    }

    case TOPICS.FRAUD_FLAGGED: {
      const flagId = id(p, null, "flagId", "fraudFlagId", "id")
      const flag = flagId
        ? await prisma.fraudFlag.findUnique({
            where: { id: flagId },
            select: { label: true, severity: true, subject: true, creator: { select: { handle: true } }, deal: { select: { title: true } } },
          })
        : null
      const subjectName = flag?.creator ? `@${flag.creator.handle}` : flag?.deal ? `deal “${flag.deal.title}”` : null
      return {
        audiences: { admin: await adminIds() },
        drafts: t.fraudFlagged({
          label: flag?.label ?? str(p, "label"),
          severity: flag?.severity ?? str(p, "severity"),
          subject: flag?.subject ?? str(p, "subject"),
          subjectName,
        }),
      }
    }

    case TOPICS.USER_KYC_VERIFIED: {
      const userId = id(p, event.key, "userId")
      const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } }) : null
      if (!user) return skip("User")
      const role = asParty(user.role)
      return { audiences: role ? { [role]: [user.id] } : {}, drafts: t.kycVerified({ role }) }
    }

    default:
      return null
  }
}

export async function handleEvent(event: EventEnvelope, log: Log) {
  if (event.topic === TOPICS.MESSAGE_SENT) {
    // No notification row for messages: just refresh recipients' unread badges.
    const p = (event.payload ?? {}) as Payload
    let recipients = Array.isArray(p.recipientIds) ? (p.recipientIds as unknown[]).filter((v): v is string => typeof v === "string") : []
    if (!recipients.length) {
      const conversationId = id(p, event.key, "conversationId")
      const senderId = str(p, "senderId")
      if (conversationId) {
        const participants = await prisma.conversationParticipant.findMany({ where: { conversationId }, select: { userId: true } })
        recipients = participants.map((x) => x.userId).filter((u) => u !== senderId)
      }
    }
    await pushUnread(recipients)
    return []
  }

  let result: Awaited<ReturnType<typeof draftsFor>>
  try {
    result = await draftsFor(event, log)
  } catch (err) {
    // A referenced record vanished between publish and consume: retrying won't help.
    if (err instanceof AppError && err.code === "NOT_FOUND") {
      log.warn({ eventId: event.id, topic: event.topic, err: err.message }, "event references a missing record; skipping")
      return []
    }
    throw err
  }
  if (!result || result.drafts.length === 0) return []
  const inputs = await toInputs(result.drafts, result.audiences)
  return deliverNotifications(event.id, event.topic, inputs)
}
