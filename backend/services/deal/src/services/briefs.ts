import { createLogger, errors, pageMeta, publish, TOPICS, type AuthUser } from "@hustl/common"
import type { BriefMatchDTO, CreateBriefRequest, OpenBriefsQuery, UpdateBriefRequest } from "@hustl/contracts"
import { prisma, Prisma, type Brief } from "@hustl/db"
import { aiPost } from "../lib/clients"
import { brandPublicSelect, creatorPublicSelect, toBriefDTO, toCreatorPublic } from "../lib/dto"

const log = createLogger("deal-service:briefs")

export async function brandForUser(user: AuthUser) {
  const brand = await prisma.brandProfile.findUnique({ where: { userId: user.id } })
  if (!brand || brand.deletedAt) throw errors.forbidden("A brand profile is required")
  return brand
}

export async function creatorForUser(user: AuthUser) {
  const creator = await prisma.creatorProfile.findUnique({ where: { userId: user.id } })
  if (!creator || creator.deletedAt) throw errors.forbidden("A creator profile is required")
  return creator
}

export async function ownedBrief(user: AuthUser, id: string) {
  const brief = await prisma.brief.findFirst({ where: { id, deletedAt: null }, include: { brand: { select: { ...brandPublicSelect, userId: true } } } })
  if (!brief) throw errors.notFound("Brief")
  if (brief.brand.userId !== user.id) throw errors.forbidden("You don't own this brief")
  return brief
}

const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(v))
const json = (v: unknown) => (v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue))

export async function createBrief(user: AuthUser, body: CreateBriefRequest) {
  const brand = await brandForUser(user)
  const brief = await prisma.brief.create({
    data: {
      brandId: brand.id,
      title: body.title,
      description: body.description,
      requirements: body.requirements,
      niche: body.niche,
      platforms: body.platforms,
      deliverables: body.deliverables,
      minFollowers: body.minFollowers,
      minEngagement: body.minEngagement,
      budgetPerCreator: body.budgetPerCreator,
      creatorsNeeded: body.creatorsNeeded,
      locations: body.locations,
      timeline: body.timeline,
      audience: body.audience,
      visibility: body.visibility,
      deadline: toDate(body.deadline) ?? null,
      ...(body.parsed && { parsed: body.parsed as Prisma.InputJsonValue }),
    },
    include: { brand: { select: brandPublicSelect } },
  })
  return toBriefDTO(brief)
}

/** Best effort: embedding failures never block brief writes; the brief-embeddings consumer retries. */
export async function embedBrief(briefId: string): Promise<"ok" | "failed"> {
  try {
    await aiPost(`/ai/embeddings/briefs/${briefId}`, {}, 15_000)
    return "ok"
  } catch (err) {
    log.warn({ err, briefId }, "brief embedding failed; will retry from the outbox consumer")
    return "failed"
  }
}

export async function updateBrief(user: AuthUser, id: string, body: UpdateBriefRequest) {
  const brief = await ownedBrief(user, id)
  if (brief.status === "CLOSED") throw errors.conflict("Closed briefs can't be edited", { from: brief.status, action: "UPDATE" })
  const { deadline, parsed, ...rest } = body
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.brief.update({
      where: { id },
      data: { ...rest, ...(deadline !== undefined && { deadline: toDate(deadline) }), ...(parsed !== undefined && { parsed: json(parsed) }) },
      include: { brand: { select: brandPublicSelect } },
    })
    if (row.status === "PUBLISHED") await publish(tx, TOPICS.BRIEF_UPDATED, id, { briefId: id, brandId: row.brandId, status: row.status, fields: Object.keys(body) })
    return row
  })
  const meta = updated.status === "PUBLISHED" ? { aiEmbedding: await embedBrief(id) } : undefined
  return { brief: toBriefDTO(updated), meta }
}

export async function publishBrief(user: AuthUser, id: string) {
  const brief = await ownedBrief(user, id)
  if (brief.status !== "DRAFT") throw errors.conflict("Only draft briefs can be published", { from: brief.status, action: "PUBLISH" })
  if (brief.deadline && brief.deadline <= new Date()) throw errors.validation("The brief deadline is in the past", { fieldErrors: { deadline: ["Must be in the future"] } })
  const published = await prisma.$transaction(async (tx) => {
    const res = await tx.brief.updateMany({ where: { id, status: "DRAFT" }, data: { status: "PUBLISHED", publishedAt: new Date() } })
    if (!res.count) throw errors.conflict("Brief was already published", { from: "PUBLISHED", action: "PUBLISH" })
    const row = await tx.brief.findUniqueOrThrow({ where: { id }, include: { brand: { select: brandPublicSelect } } })
    await publish(tx, TOPICS.BRIEF_PUBLISHED, id, {
      briefId: id,
      brandId: row.brandId,
      brandUserId: brief.brand.userId,
      title: row.title,
      niche: row.niche,
      platforms: row.platforms,
      budgetPerCreator: row.budgetPerCreator,
      visibility: row.visibility,
    })
    return row
  })
  return { brief: toBriefDTO(published), meta: { aiEmbedding: await embedBrief(id) } }
}

export async function closeBrief(user: AuthUser, id: string) {
  const brief = await ownedBrief(user, id)
  if (brief.status !== "PUBLISHED") throw errors.conflict("Only published briefs can be closed", { from: brief.status, action: "CLOSE" })
  const closed = await prisma.$transaction(async (tx) => {
    const row = await tx.brief.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date() }, include: { brand: { select: brandPublicSelect } } })
    await publish(tx, TOPICS.BRIEF_UPDATED, id, { briefId: id, brandId: row.brandId, status: "CLOSED", fields: ["status"] })
    return row
  })
  return toBriefDTO(closed)
}

export async function deleteBrief(user: AuthUser, id: string) {
  const brief = await ownedBrief(user, id)
  if (brief.status !== "DRAFT") throw errors.conflict("Only draft briefs can be deleted — close a published brief instead", { from: brief.status, action: "DELETE" })
  await prisma.brief.update({ where: { id }, data: { deletedAt: new Date() } })
  return { id, deleted: true }
}

export async function myBriefs(user: AuthUser, q: { status?: Brief["status"]; page: number; pageSize: number }) {
  const brand = await brandForUser(user)
  const where: Prisma.BriefWhereInput = { brandId: brand.id, deletedAt: null, ...(q.status && { status: q.status }) }
  const [rows, total] = await Promise.all([
    prisma.brief.findMany({
      where,
      include: { brand: { select: brandPublicSelect }, _count: { select: { applications: { where: { status: { not: "WITHDRAWN" } } } } } },
      orderBy: { updatedAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.brief.count({ where }),
  ])
  return { items: rows.map((r) => toBriefDTO(r)), meta: pageMeta(q, total) }
}

async function myApplicationsFor(user: AuthUser | undefined, briefIds: string[]) {
  if (!user || user.role !== "CREATOR" || !briefIds.length) return null
  const creator = await prisma.creatorProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
  if (!creator) return null
  const apps = await prisma.application.findMany({ where: { creatorId: creator.id, briefId: { in: briefIds } }, select: { id: true, status: true, briefId: true } })
  return new Map(apps.map((a) => [a.briefId, { id: a.id, status: a.status }]))
}

export async function getBrief(user: AuthUser | undefined, id: string) {
  const brief = await prisma.brief.findFirst({
    where: { id, deletedAt: null },
    include: { brand: { select: { ...brandPublicSelect, userId: true } }, _count: { select: { applications: { where: { status: { not: "WITHDRAWN" } } } } } },
  })
  if (!brief) throw errors.notFound("Brief")
  if (user && brief.brand.userId === user.id) return toBriefDTO(brief)
  if (brief.status === "DRAFT") throw errors.notFound("Brief")
  const mine = await myApplicationsFor(user, [brief.id])
  if (brief.visibility === "DIRECT") {
    // Invite-only briefs are visible to creators already in a conversation/deal on it.
    const invited = user && (mine?.has(brief.id) || (await prisma.deal.count({ where: { briefId: brief.id, creator: { userId: user.id } } })) > 0)
    if (!invited && user?.role !== "ADMIN") throw errors.notFound("Brief")
  }
  const { _count, ...rest } = brief
  return toBriefDTO(user?.role === "ADMIN" ? brief : (rest as typeof brief), mine ? { myApplication: mine.get(brief.id) ?? null } : {})
}

/** Marketplace ordering. Briefs without a deadline sort last on "deadline". */
function openBriefOrder(sort: OpenBriefsQuery["sort"]): Prisma.BriefOrderByWithRelationInput[] {
  if (sort === "budget") return [{ budgetPerCreator: "desc" }, { id: "asc" }]
  if (sort === "deadline") return [{ deadline: { sort: "asc", nulls: "last" } }, { id: "asc" }]
  return [{ publishedAt: "desc" }, { id: "asc" }]
}

export async function openBriefs(user: AuthUser | undefined, q: OpenBriefsQuery) {
  const and: Prisma.BriefWhereInput[] = [{ OR: [{ deadline: null }, { deadline: { gt: new Date() } }] }]
  if (q.q) and.push({ OR: [{ title: { contains: q.q, mode: "insensitive" } }, { description: { contains: q.q, mode: "insensitive" } }, { brand: { companyName: { contains: q.q, mode: "insensitive" } } }] })
  const where: Prisma.BriefWhereInput = {
    status: "PUBLISHED",
    visibility: "OPEN",
    deletedAt: null,
    ...(q.niche && { niche: { equals: q.niche, mode: "insensitive" } }),
    ...(q.platform && { platforms: { has: q.platform } }),
    ...(q.minBudget !== undefined && { budgetPerCreator: { gte: q.minBudget } }),
    AND: and,
  }
  const [rows, total] = await Promise.all([
    prisma.brief.findMany({
      where,
      include: { brand: { select: brandPublicSelect }, _count: { select: { applications: { where: { status: { not: "WITHDRAWN" } } } } } },
      orderBy: openBriefOrder(q.sort),
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.brief.count({ where }),
  ])
  const mine = await myApplicationsFor(user, rows.map((r) => r.id))
  return { items: rows.map((r) => toBriefDTO(r, mine ? { myApplication: mine.get(r.id) ?? null } : {})), meta: pageMeta(q, total) }
}

export async function parseBrief(text: string) {
  return aiPost<Record<string, unknown>>("/ai/parse-brief", { text }, 30_000)
}

type AiMatch = { creator_id: string; match_score: number; match_reasons?: string[]; disqualifiers?: string[]; components?: Record<string, unknown> | null }

export async function briefMatches(user: AuthUser, id: string, limit: number): Promise<{ briefId: string; matches: BriefMatchDTO[] }> {
  await ownedBrief(user, id)
  const res = await aiPost<AiMatch[] | { matches: AiMatch[] }>("/ai/match", { brief_id: id, limit }, 20_000)
  const list = Array.isArray(res) ? res : Array.isArray(res?.matches) ? res.matches : null
  if (!list) throw errors.serviceUnavailable("AI service")
  const ids = list.map((m) => m.creator_id).filter(Boolean)
  const creators = await prisma.creatorProfile.findMany({ where: { id: { in: ids }, deletedAt: null }, select: creatorPublicSelect })
  const byId = new Map(creators.map((c) => [c.id, c]))
  const matches = list
    .filter((m) => byId.has(m.creator_id))
    .map((m) => ({
      creator: toCreatorPublic(byId.get(m.creator_id)!),
      matchScore: m.match_score,
      matchReasons: m.match_reasons ?? [],
      disqualifiers: m.disqualifiers ?? [],
      components: m.components ?? null,
    }))
  return { briefId: id, matches }
}

export async function briefFit(user: AuthUser, id: string) {
  const creator = await creatorForUser(user)
  const brief = await prisma.brief.findFirst({ where: { id, deletedAt: null, status: "PUBLISHED" } })
  if (!brief) throw errors.notFound("Brief")
  const res = await aiPost<AiScore>("/ai/applications/score", { creator_id: creator.id, brief_id: id }, 15_000)
  return { briefId: id, creatorId: creator.id, ...normaliseScore(res) }
}

export type AiScore = { match_score: number; match_reasons?: string[]; disqualifiers?: string[]; model_version?: string | null }

/** AI scores are 0–100; tolerate 0–1 fractions. */
export function normaliseScore(s: AiScore) {
  if (typeof s?.match_score !== "number" || Number.isNaN(s.match_score)) throw errors.serviceUnavailable("AI service")
  const raw = s.match_score <= 1 && !Number.isInteger(s.match_score) ? s.match_score * 100 : s.match_score
  return {
    matchScore: Math.max(0, Math.min(100, Math.round(raw))),
    matchReasons: s.match_reasons ?? [],
    disqualifiers: s.disqualifiers ?? [],
    modelVersion: s.model_version ?? null,
  }
}
