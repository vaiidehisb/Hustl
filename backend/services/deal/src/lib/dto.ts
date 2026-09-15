import type {
  ApplicationDTO,
  ApplicationStatus,
  BriefBrandDTO,
  BriefDTO,
  ContractDTO,
  ContractTerms,
  CreatorPublicDTO,
  DealDetail,
  DealEventDTO,
  DealOfferDTO,
  DealSummary,
  DealUiAction,
  MilestoneDTO,
  MilestoneInput,
  MilestoneUiAction,
  ReviewDTO,
} from "@hustl/contracts"
import { MAX_COUNTER_ROUNDS } from "@hustl/contracts"
import type { Application, Brief, Contract, Deal, DealEvent, DealOffer, Deliverable, Milestone, Prisma, Review } from "@hustl/db"
import { isOnTime } from "../domain/rules"

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

// ─── Creators & brands ───────────────────────────────────────────────────────

export const creatorPublicSelect = {
  id: true,
  handle: true,
  avatarUrl: true,
  headline: true,
  location: true,
  niches: true,
  followersTotal: true,
  engagementRate: true,
  verifiedAt: true,
  available: true,
  completedDeals: true,
  avgRating: true,
  onTimeRate: true,
  user: { select: { name: true } },
  score: { select: { trustScore: true, reliabilityScore: true } },
} satisfies Prisma.CreatorProfileSelect
type CreatorPublicRow = Prisma.CreatorProfileGetPayload<{ select: typeof creatorPublicSelect }>

export const toCreatorPublic = (c: CreatorPublicRow): CreatorPublicDTO => ({
  id: c.id,
  handle: c.handle,
  name: c.user.name,
  avatarUrl: c.avatarUrl,
  headline: c.headline,
  location: c.location,
  niches: c.niches,
  followersTotal: c.followersTotal,
  engagementRate: c.engagementRate,
  verified: !!c.verifiedAt,
  available: c.available,
  completedDeals: c.completedDeals,
  avgRating: c.avgRating,
  onTimeRate: c.onTimeRate,
  trustScore: c.score?.trustScore ?? null,
  reliabilityScore: c.score?.reliabilityScore ?? null,
})

export const brandPublicSelect = { id: true, companyName: true, slug: true, logoUrl: true, verifiedAt: true } satisfies Prisma.BrandProfileSelect
export const toBrandPublic = (b: { id: string; companyName: string; slug: string; logoUrl: string | null; verifiedAt: Date | null }): BriefBrandDTO => ({
  id: b.id,
  companyName: b.companyName,
  slug: b.slug,
  logoUrl: b.logoUrl,
  verified: !!b.verifiedAt,
})

// ─── Briefs & applications ───────────────────────────────────────────────────

export function toBriefDTO(
  b: Brief & { brand?: { id: string; companyName: string; slug: string; logoUrl: string | null; verifiedAt: Date | null }; _count?: { applications: number } },
  extra: { myApplication?: { id: string; status: ApplicationStatus } | null } = {},
): BriefDTO {
  return {
    id: b.id,
    brandId: b.brandId,
    ...(b.brand && { brand: toBrandPublic(b.brand) }),
    title: b.title,
    description: b.description,
    requirements: b.requirements,
    niche: b.niche,
    platforms: b.platforms,
    deliverables: (b.deliverables as BriefDTO["deliverables"]) ?? [],
    minFollowers: b.minFollowers,
    minEngagement: b.minEngagement,
    budgetPerCreator: b.budgetPerCreator,
    currency: b.currency,
    creatorsNeeded: b.creatorsNeeded,
    locations: b.locations,
    timeline: b.timeline,
    audience: b.audience,
    visibility: b.visibility,
    status: b.status,
    deadline: iso(b.deadline),
    parsed: (b.parsed as Record<string, unknown> | null) ?? null,
    publishedAt: iso(b.publishedAt),
    closedAt: iso(b.closedAt),
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    ...(b._count && { applicationsCount: b._count.applications }),
    ...("myApplication" in extra && { myApplication: extra.myApplication ?? null }),
  }
}

export function toApplicationDTO(
  a: Application & {
    creator?: CreatorPublicRow
    brief?: Brief & { brand: { id: string; companyName: string; slug: string; logoUrl: string | null; verifiedAt: Date | null } }
    deal?: { id: string } | null
  },
): ApplicationDTO {
  return {
    id: a.id,
    briefId: a.briefId,
    creatorId: a.creatorId,
    pitch: a.pitch,
    proposedRate: a.proposedRate,
    status: a.status,
    matchScore: a.matchScore,
    matchReasons: a.matchReasons,
    disqualifiers: a.disqualifiers,
    scoreModelVersion: a.scoreModelVersion,
    scoredAt: iso(a.scoredAt),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    ...(a.creator && { creator: toCreatorPublic(a.creator) }),
    ...(a.brief && {
      brief: { id: a.brief.id, title: a.brief.title, status: a.brief.status, budgetPerCreator: a.brief.budgetPerCreator, deadline: iso(a.brief.deadline), brand: toBrandPublic(a.brief.brand) },
    }),
    ...(a.deal !== undefined && { dealId: a.deal?.id ?? null }),
  }
}

// ─── Deals ───────────────────────────────────────────────────────────────────

export const dealSummaryInclude = {
  brand: { select: { ...brandPublicSelect, userId: true } },
  creator: { select: { id: true, handle: true, avatarUrl: true, verifiedAt: true, userId: true, user: { select: { name: true } } } },
} satisfies Prisma.DealInclude

type SummaryParties = {
  brand: { id: string; companyName: string; slug: string; logoUrl: string | null; verifiedAt: Date | null; userId: string }
  creator: { id: string; handle: string; avatarUrl: string | null; verifiedAt: Date | null; userId: string; user: { name: string } }
}

export type ViewerParty = "BRAND" | "CREATOR" | "ADMIN"

export function toDealSummary(d: Deal & SummaryParties, yourParty: ViewerParty): DealSummary {
  return {
    id: d.id,
    title: d.title,
    status: d.status,
    amount: d.amount,
    currency: d.currency,
    paymentMode: d.paymentMode,
    dueDate: iso(d.dueDate),
    awaitingParty: d.awaitingParty,
    yourParty,
    negotiationRounds: d.negotiationRounds,
    holdUntil: iso(d.holdUntil),
    briefId: d.briefId,
    applicationId: d.applicationId,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    completedAt: iso(d.completedAt),
    cancelledAt: iso(d.cancelledAt),
    brand: toBrandPublic(d.brand),
    creator: { id: d.creator.id, handle: d.creator.handle, name: d.creator.user.name, avatarUrl: d.creator.avatarUrl, verified: !!d.creator.verifiedAt },
  }
}

export const dealDetailInclude = {
  brand: { select: { ...brandPublicSelect, userId: true } },
  creator: { select: { id: true, handle: true, avatarUrl: true, verifiedAt: true, userId: true, user: { select: { name: true } } } },
  milestones: { orderBy: { position: "asc" }, include: { submissions: { orderBy: { createdAt: "asc" } } } },
  offers: { orderBy: { round: "asc" } },
  contract: true,
  events: { orderBy: { createdAt: "asc" } },
  reviews: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.DealInclude
export type DealDetailRow = Prisma.DealGetPayload<{ include: typeof dealDetailInclude }>

export function dealAllowedActions(
  d: Pick<Deal, "status" | "awaitingParty" | "negotiationRounds" | "holdUntil">,
  party: ViewerParty,
  ctx: { contract: Pick<Contract, "brandSignedAt" | "creatorSignedAt"> | null; reviewedByViewer: boolean; now?: Date },
): DealUiAction[] {
  const now = ctx.now ?? new Date()
  if (party === "ADMIN") return ["OFFER_SENT", "NEGOTIATING", "AGREED", "CONTRACT_SIGNED"].includes(d.status) ? ["CANCEL"] : []
  const out: DealUiAction[] = []
  switch (d.status) {
    case "OFFER_SENT":
    case "NEGOTIATING":
      if (d.awaitingParty === party) {
        out.push("ACCEPT", "DECLINE")
        if (d.negotiationRounds < MAX_COUNTER_ROUNDS) out.push("COUNTER")
      }
      out.push("CANCEL")
      break
    case "AGREED": {
      const signed = party === "BRAND" ? ctx.contract?.brandSignedAt : ctx.contract?.creatorSignedAt
      if (ctx.contract && !signed) out.push("SIGN")
      out.push("CANCEL")
      break
    }
    case "CONTRACT_SIGNED":
      if (party === "BRAND" && !(d.holdUntil && d.holdUntil > now)) out.push("FUND")
      out.push("CANCEL")
      break
    case "FUNDED":
    case "IN_PROGRESS":
      out.push("DISPUTE")
      break
    case "COMPLETED":
      if (!ctx.reviewedByViewer) out.push("REVIEW")
      break
  }
  return out
}

export function milestoneAllowedActions(
  d: Pick<Deal, "status" | "paymentMode">,
  m: Pick<Milestone, "status" | "position">,
  all: Pick<Milestone, "status" | "position">[],
  party: ViewerParty,
): MilestoneUiAction[] {
  if (d.status !== "IN_PROGRESS") return []
  if (party === "CREATOR" && (m.status === "PENDING" || m.status === "REVISION_REQUESTED")) {
    const blocked = d.paymentMode !== "UPFRONT" && all.some((x) => x.position < m.position && x.status !== "APPROVED" && x.status !== "RELEASED")
    return blocked ? [] : ["SUBMIT"]
  }
  if (party === "BRAND" && m.status === "SUBMITTED") return ["APPROVE", "REQUEST_REVISION"]
  if (party === "BRAND" && m.status === "APPROVED") return ["RETRY_RELEASE"]
  return []
}

const toDeliverableDTO = (s: Deliverable) => ({ id: s.id, url: s.url, mediaAssetId: s.mediaAssetId, note: s.note, createdAt: s.createdAt.toISOString() })

export function toMilestoneDTO(d: Pick<Deal, "status" | "paymentMode">, m: Milestone & { submissions?: Deliverable[] }, all: Milestone[], party: ViewerParty): MilestoneDTO {
  return {
    id: m.id,
    position: m.position,
    title: m.title,
    percent: m.percent,
    amount: m.amount,
    dueDate: iso(m.dueDate),
    status: m.status,
    revisionCount: m.revisionCount,
    revisionNote: m.revisionNote,
    submittedAt: iso(m.submittedAt),
    approvedAt: iso(m.approvedAt),
    releasedAt: iso(m.releasedAt),
    onTime: isOnTime(m.dueDate, m.submittedAt),
    submissions: (m.submissions ?? []).map(toDeliverableDTO),
    allowedActions: milestoneAllowedActions(d, m, all, party),
  }
}

const toOfferDTO = (o: DealOffer): DealOfferDTO => ({
  id: o.id,
  round: o.round,
  proposedBy: o.proposedBy,
  amount: o.amount,
  paymentMode: o.paymentMode,
  milestones: (o.milestones as MilestoneInput[]) ?? [],
  deliverables: o.deliverables,
  dueDate: iso(o.dueDate),
  note: o.note,
  status: o.status,
  respondedAt: iso(o.respondedAt),
  createdAt: o.createdAt.toISOString(),
})

export function toContractDTO(c: Contract, party: ViewerParty): ContractDTO {
  return {
    id: c.id,
    dealId: c.dealId,
    version: c.version,
    terms: c.terms as unknown as ContractTerms,
    bodyHash: c.bodyHash,
    signatures: {
      brand: { signedAt: iso(c.brandSignedAt), signerName: c.brandSignerName, ...((party === "BRAND" || party === "ADMIN") && { ip: c.brandSignerIp }) },
      creator: { signedAt: iso(c.creatorSignedAt), signerName: c.creatorSignerName, ...((party === "CREATOR" || party === "ADMIN") && { ip: c.creatorSignerIp }) },
    },
    fullySigned: !!(c.brandSignedAt && c.creatorSignedAt),
    pdfMediaId: c.pdfMediaId,
    createdAt: c.createdAt.toISOString(),
  }
}

const toEventDTO = (e: DealEvent): DealEventDTO => ({
  id: e.id,
  type: e.type,
  actorId: e.actorId,
  fromStatus: e.fromStatus,
  toStatus: e.toStatus,
  data: (e.data as Record<string, unknown>) ?? {},
  createdAt: e.createdAt.toISOString(),
})

const toReviewDTO = (r: Review): ReviewDTO => ({ id: r.id, dealId: r.dealId, authorId: r.authorId, subjectUserId: r.subjectUserId, rating: r.rating, comment: r.comment, createdAt: r.createdAt.toISOString() })

export function toDealDetail(d: DealDetailRow, party: ViewerParty, viewerId: string): DealDetail {
  const feeRates =
    party === "BRAND" ? { brand: d.brandFeeRate, processing: d.processingFeeRate } : party === "CREATOR" ? { creator: d.creatorFeeRate } : { brand: d.brandFeeRate, processing: d.processingFeeRate, creator: d.creatorFeeRate }
  return {
    ...toDealSummary(d, party),
    deliverables: d.deliverables,
    feeRates,
    offers: d.offers.map(toOfferDTO),
    milestones: d.milestones.map((m) => toMilestoneDTO(d, m, d.milestones, party)),
    contract: d.contract ? toContractDTO(d.contract, party) : null,
    events: d.events.map(toEventDTO),
    reviews: d.reviews.map(toReviewDTO),
    allowedActions: dealAllowedActions(d, party, { contract: d.contract, reviewedByViewer: d.reviews.some((r) => r.authorId === viewerId) }),
    counterRoundsRemaining: Math.max(0, MAX_COUNTER_ROUNDS - d.negotiationRounds),
  }
}
