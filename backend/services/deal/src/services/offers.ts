// Offers, negotiation, acceptance (contract generation), decline, cancel and signing.

import { errors, publish, TOPICS, type AuthUser } from "@hustl/common"
import { MAX_COUNTER_ROUNDS, type CounterOfferRequest, type CreateOfferRequest, type MilestoneInput, type PaymentMode, type SignContractRequest, type SplitMilestone } from "@hustl/contracts"
import { prisma, Prisma } from "@hustl/db"
import { assertTransition } from "../domain/deal-machine"
import { buildContractTerms, hashTerms, namesMatch } from "../domain/contract-terms"
import { assertCanCounter, feeSnapshot, fraudHold, resolveMilestones, upfrontEligibility } from "../domain/rules"
import { lockDeal, otherParty, partiesPayload, recordDealEvent, requireParty, transitionDeal, type DealWithParties, type Tx } from "../lib/deal-access"
import { recomputeCreatorStats } from "./stats"

const planJson = (ms: SplitMilestone[]): MilestoneInput[] => ms.map((m) => ({ title: m.title, percent: m.percent, dueDate: m.dueDate ?? null }))

function assertUpfront(mode: PaymentMode, reliabilityScore: number | null | undefined, brandKycStatus: string) {
  if (mode !== "UPFRONT") return
  const e = upfrontEligibility({ reliabilityScore, brandKycStatus })
  if (!e.eligible) throw errors.validation("Upfront payment mode is not available for this deal", { fieldErrors: { paymentMode: e.reasons }, reasons: e.reasons })
}

async function applyFraudHold(tx: Tx, deal: { id: string; brandId: string }, actorId: string, hold: NonNullable<ReturnType<typeof fraudHold>>, amount: number) {
  const flag = await tx.fraudFlag.create({
    data: {
      subject: "DEAL",
      dealId: deal.id,
      code: "NEW_BRAND_HIGH_VALUE",
      label: "New brand account sending a high-value offer",
      severity: "MEDIUM",
      source: "RULE",
      details: { amount, brandAgeHours: hold.brandAgeHours, holdUntil: hold.holdUntil.toISOString() },
    },
  })
  await recordDealEvent(tx, deal.id, "FRAUD_HOLD_APPLIED", actorId, { fraudFlagId: flag.id, holdUntil: hold.holdUntil.toISOString() })
  await publish(tx, TOPICS.FRAUD_FLAGGED, deal.id, { fraudFlagId: flag.id, subject: "DEAL", dealId: deal.id, brandId: deal.brandId, code: flag.code, severity: flag.severity, holdUntil: hold.holdUntil.toISOString() })
}

async function writeMilestones(tx: Tx, dealId: string, milestones: SplitMilestone[]) {
  await tx.milestone.deleteMany({ where: { dealId } })
  await tx.milestone.createMany({
    data: milestones.map((m) => ({ dealId, position: m.position, title: m.title, percent: m.percent, amount: m.amount, dueDate: m.dueDate ? new Date(m.dueDate) : null })),
  })
}

export async function createOffer(user: AuthUser, body: CreateOfferRequest): Promise<string> {
  const brand = await prisma.brandProfile.findUnique({ where: { userId: user.id }, include: { user: { select: { kycStatus: true, createdAt: true } } } })
  if (!brand || brand.deletedAt) throw errors.forbidden("A brand profile is required to send offers")
  const creator = await prisma.creatorProfile.findFirst({ where: { id: body.creatorId, deletedAt: null }, include: { user: { select: { id: true, status: true } }, score: { select: { reliabilityScore: true } } } })
  if (!creator) throw errors.notFound("Creator")
  if (creator.userId === user.id) throw errors.validation("You can't send an offer to yourself")
  if (creator.user.status !== "ACTIVE") throw errors.conflict("This creator's account is not active")

  let briefId = body.briefId ?? null
  if (briefId) {
    const brief = await prisma.brief.findFirst({ where: { id: briefId, deletedAt: null } })
    if (!brief) throw errors.notFound("Brief")
    if (brief.brandId !== brand.id) throw errors.forbidden("You don't own this brief")
  }
  let application: { id: string; status: string } | null = null
  if (body.applicationId) {
    const app = await prisma.application.findUnique({ where: { id: body.applicationId }, include: { brief: true, deal: { select: { id: true } } } })
    if (!app) throw errors.notFound("Application")
    if (app.brief.brandId !== brand.id) throw errors.forbidden("You don't own this application's brief")
    if (app.creatorId !== creator.id || (briefId && app.briefId !== briefId)) throw errors.validation("The application doesn't match this creator/brief")
    if (app.deal) throw errors.conflict("An offer already exists for this application", { dealId: app.deal.id })
    if (app.status !== "APPLIED" && app.status !== "SHORTLISTED") throw errors.conflict(`Can't send an offer on a ${app.status.toLowerCase()} application`, { from: app.status, action: "OFFER" })
    briefId = app.briefId
    application = { id: app.id, status: app.status }
  }

  assertUpfront(body.paymentMode, creator.score?.reliabilityScore, brand.user.kycStatus)
  const milestones = resolveMilestones(body.amount, body.paymentMode, body.milestones, body.dueDate)
  const fees = feeSnapshot(brand.plan)
  const hold = fraudHold({ brandUserCreatedAt: brand.user.createdAt, amount: body.amount })

  return prisma.$transaction(async (tx) => {
    const deal = await tx.deal.create({
      data: {
        title: body.title,
        briefId,
        applicationId: application?.id ?? null,
        brandId: brand.id,
        creatorId: creator.id,
        status: "OFFER_SENT",
        amount: body.amount,
        paymentMode: body.paymentMode,
        deliverables: body.deliverables,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        awaitingParty: "CREATOR",
        ...fees,
        holdUntil: hold?.holdUntil ?? null,
      },
    })
    await writeMilestones(tx, deal.id, milestones)
    const offer = await tx.dealOffer.create({
      data: {
        dealId: deal.id,
        round: 0,
        proposedBy: "BRAND",
        proposedById: user.id,
        amount: body.amount,
        paymentMode: body.paymentMode,
        milestones: planJson(milestones) as Prisma.InputJsonValue,
        deliverables: body.deliverables,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        note: body.message ?? null,
      },
    })
    await tx.dealEvent.create({ data: { dealId: deal.id, actorId: user.id, type: "OFFER_SENT", toStatus: "OFFER_SENT", data: { offerId: offer.id, round: 0, amount: body.amount, paymentMode: body.paymentMode } } })
    const parties = { dealId: deal.id, brandId: brand.id, creatorId: creator.id, brandUserId: user.id, creatorUserId: creator.userId }
    await publish(tx, TOPICS.OFFER_SENT, deal.id, { ...parties, offerId: offer.id, round: 0, title: deal.title, amount: deal.amount, paymentMode: deal.paymentMode, briefId, applicationId: application?.id ?? null, message: body.message ?? null })
    if (application) {
      await tx.application.update({ where: { id: application.id }, data: { status: "OFFERED" } })
      await publish(tx, TOPICS.APPLICATION_STATUS_CHANGED, briefId!, { applicationId: application.id, briefId, creatorId: creator.id, creatorUserId: creator.userId, brandUserId: user.id, brandId: brand.id, from: application.status, to: "OFFERED", dealId: deal.id })
    }
    if (hold) await applyFraudHold(tx, deal, user.id, hold, body.amount)
    return deal.id
  })
}

async function latestPendingOffer(tx: Tx, dealId: string) {
  const offer = await tx.dealOffer.findFirst({ where: { dealId }, orderBy: { round: "desc" } })
  if (!offer || offer.status !== "PENDING") throw errors.conflict("There is no pending offer on this deal")
  return offer
}

function assertTurn(deal: DealWithParties, party: "BRAND" | "CREATOR", action: "COUNTER" | "ACCEPT" | "DECLINE") {
  assertTransition(deal.status, action, party)
  if (deal.awaitingParty !== party) throw errors.conflict("It's the other party's turn to respond", { from: deal.status, action, awaitingParty: deal.awaitingParty })
}

export async function counterOffer(user: AuthUser, dealId: string, body: CounterOfferRequest) {
  await prisma.$transaction(async (tx) => {
    const deal = await lockDeal(tx, dealId)
    const party = requireParty(deal, user)
    assertTurn(deal, party, "COUNTER")
    assertCanCounter(deal.negotiationRounds, deal.status)
    const current = await latestPendingOffer(tx, dealId)

    const mode = body.paymentMode ?? current.paymentMode
    const plan = body.milestones ?? (mode === current.paymentMode ? (current.milestones as MilestoneInput[]) : undefined)
    const dueDate = body.dueDate !== undefined ? body.dueDate : (current.dueDate?.toISOString() ?? null)
    const milestones = resolveMilestones(body.amount, mode, plan, dueDate)
    assertUpfront(mode, deal.creator.score?.reliabilityScore, deal.brand.user.kycStatus)
    const deliverables = body.deliverables ?? current.deliverables

    await tx.dealOffer.update({ where: { id: current.id }, data: { status: "COUNTERED", respondedAt: new Date() } })
    const offer = await tx.dealOffer.create({
      data: {
        dealId,
        round: current.round + 1,
        proposedBy: party,
        proposedById: user.id,
        amount: body.amount,
        paymentMode: mode,
        milestones: planJson(milestones) as Prisma.InputJsonValue,
        deliverables,
        dueDate: dueDate ? new Date(dueDate) : null,
        note: body.note ?? null,
      },
    })
    await writeMilestones(tx, dealId, milestones)
    const hold = deal.holdUntil ? null : fraudHold({ brandUserCreatedAt: deal.brand.user.createdAt, amount: body.amount })
    await transitionDeal(tx, deal, "COUNTER", party, {
      actorId: user.id,
      update: {
        amount: body.amount,
        paymentMode: mode,
        deliverables,
        dueDate: dueDate ? new Date(dueDate) : null,
        awaitingParty: otherParty(party),
        negotiationRounds: deal.negotiationRounds + 1,
        ...(hold && { holdUntil: hold.holdUntil }),
      },
      data: { offerId: offer.id, round: offer.round, amount: body.amount, paymentMode: mode, roundsRemaining: MAX_COUNTER_ROUNDS - deal.negotiationRounds - 1 },
      payload: { offerId: offer.id, round: offer.round, proposedBy: party, amount: body.amount, paymentMode: mode, note: body.note ?? null },
    })
    if (hold) await applyFraudHold(tx, deal, user.id, hold, body.amount)
  })
}

export async function acceptOffer(user: AuthUser, dealId: string) {
  await prisma.$transaction(async (tx) => {
    const deal = await lockDeal(tx, dealId)
    const party = requireParty(deal, user)
    assertTurn(deal, party, "ACCEPT")
    const offer = await latestPendingOffer(tx, dealId)
    assertUpfront(deal.paymentMode, deal.creator.score?.reliabilityScore, deal.brand.user.kycStatus)
    await tx.dealOffer.update({ where: { id: offer.id }, data: { status: "ACCEPTED", respondedAt: new Date() } })
    await transitionDeal(tx, deal, "ACCEPT", party, { actorId: user.id, update: { awaitingParty: null }, data: { offerId: offer.id, round: offer.round }, payload: { offerId: offer.id, round: offer.round } })

    const terms = buildContractTerms({
      dealId: deal.id,
      agreedOfferRound: offer.round,
      title: deal.title,
      deliverables: deal.deliverables,
      briefId: deal.briefId,
      amount: deal.amount,
      currency: deal.currency,
      paymentMode: deal.paymentMode,
      dueDate: deal.dueDate,
      feeRates: { brand: deal.brandFeeRate, creator: deal.creatorFeeRate, processing: deal.processingFeeRate },
      brand: { id: deal.brandId, companyName: deal.brand.companyName, userId: deal.brand.userId, userName: deal.brand.user.name },
      creator: { id: deal.creatorId, handle: deal.creator.handle, userId: deal.creator.userId, userName: deal.creator.user.name },
      milestones: deal.milestones,
    })
    const contract = await tx.contract.create({ data: { dealId: deal.id, terms: terms as unknown as Prisma.InputJsonValue, bodyHash: hashTerms(terms) } })
    await recordDealEvent(tx, deal.id, "CONTRACT_GENERATED", null, { contractId: contract.id, bodyHash: contract.bodyHash })
  })
}

export async function declineOffer(user: AuthUser, dealId: string, reason?: string) {
  await prisma.$transaction(async (tx) => {
    const deal = await lockDeal(tx, dealId)
    const party = requireParty(deal, user)
    assertTurn(deal, party, "DECLINE")
    const offer = await latestPendingOffer(tx, dealId)
    await tx.dealOffer.update({ where: { id: offer.id }, data: { status: "DECLINED", respondedAt: new Date() } })
    await transitionDeal(tx, deal, "DECLINE", party, { actorId: user.id, update: { awaitingParty: null }, data: { offerId: offer.id, reason: reason ?? null }, payload: { reason: reason ?? null } })
    await releaseApplication(tx, deal)
  })
}

async function releaseApplication(tx: Tx, deal: DealWithParties) {
  if (!deal.applicationId) return
  const app = await tx.application.findUnique({ where: { id: deal.applicationId } })
  if (!app || app.status !== "OFFERED") return
  await tx.application.update({ where: { id: app.id }, data: { status: "REJECTED" } })
  await publish(tx, TOPICS.APPLICATION_STATUS_CHANGED, app.briefId, { applicationId: app.id, briefId: app.briefId, ...partiesPayload(deal), from: "OFFERED", to: "REJECTED" })
}

export async function cancelDeal(user: AuthUser, dealId: string, reason?: string) {
  await prisma.$transaction(async (tx) => {
    const deal = await lockDeal(tx, dealId)
    const party = deal.brand.userId === user.id ? "BRAND" : deal.creator.userId === user.id ? "CREATOR" : user.role === "ADMIN" ? "ADMIN" : null
    if (!party) throw errors.forbidden("You are not a party to this deal")
    assertTransition(deal.status, "CANCEL", party)
    if (deal.status === "CONTRACT_SIGNED") {
      const paying = await tx.paymentIntent.count({ where: { dealId, status: { in: ["PROCESSING", "SUCCEEDED"] } } })
      if (paying) throw errors.conflict("A payment for this deal is already processing", { from: deal.status, action: "CANCEL" })
    }
    await tx.dealOffer.updateMany({ where: { dealId, status: "PENDING" }, data: { status: "WITHDRAWN", respondedAt: new Date() } })
    const hadContract = !!(await tx.contract.count({ where: { dealId } }))
    await transitionDeal(tx, deal, "CANCEL", party, { actorId: user.id, update: { awaitingParty: null }, data: { reason: reason ?? null }, payload: { reason: reason ?? null } })
    await releaseApplication(tx, deal)
    if (hadContract) await recomputeCreatorStats(tx, deal.creatorId)
  })
}

export async function signContract(user: AuthUser, dealId: string, body: SignContractRequest, ip: string) {
  await prisma.$transaction(async (tx) => {
    const deal = await lockDeal(tx, dealId)
    const party = requireParty(deal, user)
    assertTransition(deal.status, "SIGN", party)
    const contract = await tx.contract.findUnique({ where: { dealId } })
    if (!contract) throw errors.conflict("No contract has been generated for this deal", { from: deal.status, action: "SIGN" })
    if (body.bodyHash && body.bodyHash !== contract.bodyHash) throw errors.conflict("The contract changed since you reviewed it — reload before signing", { bodyHash: contract.bodyHash })
    if (hashTerms(contract.terms) !== contract.bodyHash) throw errors.conflict("Contract terms no longer match the generated document hash; signing is blocked", { bodyHash: contract.bodyHash })

    const expected = party === "BRAND" ? deal.brand.user.name : deal.creator.user.name
    if (!namesMatch(body.signerName, expected)) throw errors.validation("Signer name must match the name on your account", { fieldErrors: { signerName: ["Type your full name exactly as it appears on your account"] } })

    const now = new Date()
    const signedField = party === "BRAND" ? "brandSignedAt" : "creatorSignedAt"
    const res = await tx.contract.updateMany({
      where: { id: contract.id, bodyHash: contract.bodyHash, [signedField]: null },
      data: party === "BRAND" ? { brandSignedAt: now, brandSignerName: body.signerName, brandSignerIp: ip } : { creatorSignedAt: now, creatorSignerName: body.signerName, creatorSignerIp: ip },
    })
    if (!res.count) throw errors.conflict("You have already signed this contract", { from: deal.status, action: "SIGN" })
    await recordDealEvent(tx, dealId, `CONTRACT_SIGNED_BY_${party}`, user.id, { contractId: contract.id, bodyHash: contract.bodyHash, signerName: body.signerName })

    const otherSigned = party === "BRAND" ? contract.creatorSignedAt : contract.brandSignedAt
    if (otherSigned) {
      await transitionDeal(tx, deal, "SIGN", party, {
        actorId: user.id,
        data: { contractId: contract.id, bodyHash: contract.bodyHash },
        payload: { contractId: contract.id, bodyHash: contract.bodyHash },
      })
    }
  })
}
