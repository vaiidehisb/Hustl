import { createLogger, errors, pageMeta, publish, TOPICS, type AuthUser } from "@hustl/common"
import type { ApplicationScoreResult, ApplicationStatus, ApplyMeta, CreateApplicationRequest } from "@hustl/contracts"
import { prisma, type Prisma } from "@hustl/db"
import { aiPost } from "../lib/clients"
import { brandPublicSelect, creatorPublicSelect, toApplicationDTO } from "../lib/dto"
import { creatorForUser, normaliseScore, ownedBrief, type AiScore } from "./briefs"

const log = createLogger("deal-service:applications")
export const SYNC_SCORING_LIMIT = 10
const BATCH_SIZE = 50

export async function persistScore(applicationId: string, s: ApplicationScoreResult) {
  const app = await prisma.application.update({
    where: { id: applicationId },
    data: {
      matchScore: Math.max(0, Math.min(100, Math.round(s.matchScore))),
      matchReasons: s.matchReasons,
      disqualifiers: s.disqualifiers,
      scoreModelVersion: s.modelVersion ?? null,
      scoredAt: new Date(),
    },
  })
  return toApplicationDTO(app)
}

type BatchResult = AiScore & { application_id: string }

/** Scores every unscored application on a brief via the AI batch endpoint and persists results. */
export async function scoreBriefBatch(briefId: string) {
  const pending = await prisma.application.findMany({ where: { briefId, scoredAt: null, status: { not: "WITHDRAWN" } }, select: { id: true }, orderBy: { createdAt: "asc" }, take: BATCH_SIZE })
  if (!pending.length) return 0
  const res = await aiPost<BatchResult[] | { results: BatchResult[] }>("/ai/applications/score-batch", { application_ids: pending.map((p) => p.id) }, 60_000)
  const results = Array.isArray(res) ? res : (res?.results ?? [])
  const wanted = new Set(pending.map((p) => p.id))
  let saved = 0
  for (const r of results) {
    if (!wanted.has(r.application_id)) continue
    try {
      await persistScore(r.application_id, normaliseScore(r))
      saved++
    } catch (err) {
      log.warn({ err, applicationId: r.application_id }, "skipping invalid batch score")
    }
  }
  return saved
}

const statusPayload = (a: { id: string; briefId: string; creatorId: string }, extra: { creatorUserId: string; brandUserId: string; brandId: string; from: ApplicationStatus; to: ApplicationStatus }) => ({
  applicationId: a.id,
  briefId: a.briefId,
  creatorId: a.creatorId,
  ...extra,
})

export async function apply(user: AuthUser, briefId: string, body: CreateApplicationRequest): Promise<{ application: ReturnType<typeof toApplicationDTO>; meta: ApplyMeta }> {
  const creator = await creatorForUser(user)
  const brief = await prisma.brief.findFirst({ where: { id: briefId, deletedAt: null }, include: { brand: { select: { userId: true } } } })
  if (!brief) throw errors.notFound("Brief")
  if (brief.status !== "PUBLISHED") throw errors.conflict("This brief is not accepting applications", { from: brief.status, action: "APPLY" })
  if (brief.visibility !== "OPEN") throw errors.forbidden("This brief is invite-only")
  if (brief.deadline && brief.deadline <= new Date()) throw errors.conflict("The application deadline has passed", { deadline: brief.deadline.toISOString() })
  if (brief.brand.userId === user.id) throw errors.forbidden("You can't apply to your own brief")

  const application = await prisma.$transaction(async (tx) => {
    const existing = await tx.application.findUnique({ where: { briefId_creatorId: { briefId, creatorId: creator.id } } })
    if (existing && existing.status !== "WITHDRAWN") throw errors.conflict("You have already applied to this brief", { applicationId: existing.id, status: existing.status })
    const data = { pitch: body.pitch, proposedRate: body.proposedRate, status: "APPLIED" as const, matchScore: null, matchReasons: [], disqualifiers: [], scoreModelVersion: null, scoredAt: null }
    const row = existing ? await tx.application.update({ where: { id: existing.id }, data }) : await tx.application.create({ data: { ...data, briefId, creatorId: creator.id } })
    await publish(tx, TOPICS.APPLICATION_SUBMITTED, briefId, {
      applicationId: row.id,
      briefId,
      creatorId: creator.id,
      creatorUserId: user.id,
      brandId: brief.brandId,
      brandUserId: brief.brand.userId,
      proposedRate: row.proposedRate,
      reapplied: !!existing,
    })
    return row
  })

  const count = await prisma.application.count({ where: { briefId, status: { not: "WITHDRAWN" } } })
  if (count <= SYNC_SCORING_LIMIT) {
    try {
      const score = normaliseScore(await aiPost<AiScore>("/ai/applications/score", { application_id: application.id }, 15_000))
      return { application: await persistScore(application.id, score), meta: { aiScoring: "scored" } }
    } catch (err) {
      log.warn({ err, applicationId: application.id }, "synchronous application scoring failed; stored unscored")
      return { application: toApplicationDTO(application), meta: { aiScoring: "failed" } }
    }
  }
  // Busy brief: respond immediately and score in the background.
  void scoreBriefBatch(briefId).catch((err) => log.warn({ err, briefId }, "batch application scoring failed; applications stay unscored"))
  return { application: toApplicationDTO(application), meta: { aiScoring: "queued" } }
}

export async function briefApplications(user: AuthUser, briefId: string, q: { status?: ApplicationStatus; page: number; pageSize: number }) {
  await ownedBrief(user, briefId)
  const where: Prisma.ApplicationWhereInput = { briefId, ...(q.status ? { status: q.status } : { status: { not: "WITHDRAWN" } }) }
  const [rows, total] = await Promise.all([
    prisma.application.findMany({
      where,
      include: { creator: { select: creatorPublicSelect }, deal: { select: { id: true } } },
      orderBy: [{ matchScore: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.application.count({ where }),
  ])
  return { items: rows.map((r) => toApplicationDTO(r)), meta: pageMeta(q, total) }
}

export async function myApplications(user: AuthUser, q: { status?: ApplicationStatus; page: number; pageSize: number }) {
  const creator = await creatorForUser(user)
  const where: Prisma.ApplicationWhereInput = { creatorId: creator.id, ...(q.status && { status: q.status }) }
  const [rows, total] = await Promise.all([
    prisma.application.findMany({
      where,
      include: { brief: { include: { brand: { select: brandPublicSelect } } }, deal: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.application.count({ where }),
  ])
  return { items: rows.map((r) => toApplicationDTO(r)), meta: pageMeta(q, total) }
}

export async function withdrawApplication(user: AuthUser, id: string) {
  const creator = await creatorForUser(user)
  const app = await prisma.application.findUnique({ where: { id }, include: { brief: { include: { brand: { select: { userId: true } } } } } })
  if (!app) throw errors.notFound("Application")
  if (app.creatorId !== creator.id) throw errors.forbidden("You don't own this application")
  if (app.status !== "APPLIED" && app.status !== "SHORTLISTED") throw errors.conflict(`A ${app.status.toLowerCase()} application can't be withdrawn`, { from: app.status, action: "WITHDRAW" })
  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.application.updateMany({ where: { id, status: app.status }, data: { status: "WITHDRAWN" } })
    if (!res.count) throw errors.conflict("Application changed — reload and retry", { from: app.status, action: "WITHDRAW" })
    await publish(tx, TOPICS.APPLICATION_STATUS_CHANGED, app.briefId, statusPayload(app, { creatorUserId: user.id, brandUserId: app.brief.brand.userId, brandId: app.brief.brandId, from: app.status, to: "WITHDRAWN" }))
    return tx.application.findUniqueOrThrow({ where: { id } })
  })
  return toApplicationDTO(updated)
}

const BRAND_TRANSITIONS: Record<"SHORTLISTED" | "REJECTED", ApplicationStatus[]> = { SHORTLISTED: ["APPLIED"], REJECTED: ["APPLIED", "SHORTLISTED"] }

export async function setApplicationStatus(user: AuthUser, id: string, to: "SHORTLISTED" | "REJECTED") {
  const app = await prisma.application.findUnique({ where: { id }, include: { brief: { include: { brand: { select: { userId: true } } } }, creator: { select: { userId: true } } } })
  if (!app || app.brief.deletedAt) throw errors.notFound("Application")
  if (app.brief.brand.userId !== user.id) throw errors.forbidden("You don't own this brief")
  if (!BRAND_TRANSITIONS[to].includes(app.status)) throw errors.conflict(`Can't move a ${app.status.toLowerCase()} application to ${to.toLowerCase()}`, { from: app.status, to })
  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.application.updateMany({ where: { id, status: app.status }, data: { status: to } })
    if (!res.count) throw errors.conflict("Application changed — reload and retry", { from: app.status, to })
    await publish(tx, TOPICS.APPLICATION_STATUS_CHANGED, app.briefId, {
      ...statusPayload(app, { creatorUserId: app.creator.userId, brandUserId: user.id, brandId: app.brief.brandId, from: app.status, to }),
      briefTitle: app.brief.title,
    })
    return tx.application.findUniqueOrThrow({ where: { id }, include: { creator: { select: creatorPublicSelect } } })
  })
  return toApplicationDTO(updated)
}
