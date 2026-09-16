import type { FastifyInstance, FastifyRequest } from "fastify"
import { prisma, Prisma } from "@hustl/db"
import { errors, internalOrUser, ok, pageMeta, parse, requireRole } from "@hustl/common"
import {
  fraudFlagListQuery,
  fraudFlagReviewBody,
  selfReportedAccountBody,
  socialAccountIdParams,
  socialCreatorIdParams,
  type CreatorDemographics,
  type CreatorMetrics,
  type PhylloSdkToken,
  type SocialProvidersStatus,
} from "@hustl/contracts"
import { accountDto, fraudFlagDto, scoreDto, snapshotDto } from "./dto"
import { assertPhylloConfigured, phyllo, PHYLLO_PRODUCTS, phylloStatus, toAppError, verifyWebhookSignature } from "./integrations/phyllo"
import { applyMetrics, recomputeAndPublish } from "./normalise"
import { handlePhylloWebhook, syncCreator } from "./sync"

const DAY_MS = 24 * 60 * 60 * 1000

async function myCreator(req: FastifyRequest) {
  const creator = await prisma.creatorProfile.findUnique({ where: { userId: req.user!.id }, include: { user: { select: { name: true } } } })
  if (!creator || creator.deletedAt) throw errors.notFound("Creator profile")
  return creator
}

/** The creator themselves, any brand, an admin, or an internal service. */
async function viewableCreator(req: FastifyRequest, creatorId: string) {
  const creator = await prisma.creatorProfile.findUnique({ where: { id: creatorId }, include: { score: true } })
  if (!creator || creator.deletedAt) throw errors.notFound("Creator")
  if (req.internal) return creator
  const role = req.user?.role
  if (role === "ADMIN" || role === "BRAND" || creator.userId === req.user?.id) return creator
  throw errors.forbidden()
}

async function withPhyllo<T>(fn: () => Promise<T>) {
  try {
    return await fn()
  } catch (err) {
    throw toAppError(err)
  }
}

export async function registerSocialRoutes(app: FastifyInstance) {
  app.get("/social/providers", async () => {
    const data: SocialProvidersStatus = { phyllo: phylloStatus(), selfReported: { enabled: true } }
    return ok(data)
  })

  app.post("/social/phyllo/sdk-token", { preHandler: requireRole("CREATOR") }, async (req) => {
    assertPhylloConfigured()
    const creator = await myCreator(req)
    return withPhyllo(async () => {
      const user = await phyllo.getOrCreateUser(creator.id, creator.user.name)
      const token = await phyllo.createSdkToken(user.id)
      const data: PhylloSdkToken = {
        phylloUserId: user.id,
        sdkToken: token.sdk_token,
        expiresAt: token.expires_at,
        environment: phylloStatus().environment,
        products: [...PHYLLO_PRODUCTS],
      }
      return ok(data)
    })
  })

  // Webhook: needs the raw body for HMAC verification.
  await app.register(async (scope) => {
    scope.removeContentTypeParser("application/json")
    scope.addContentTypeParser("application/json", { parseAs: "buffer", bodyLimit: 1024 * 1024 }, (_req, body, done) => done(null, body))
    scope.post("/social/phyllo/webhook", async (req) => {
      const status = phylloStatus()
      const missing = [...status.missingEnv, ...(status.webhookConfigured ? [] : ["PHYLLO_WEBHOOK_SECRET"])]
      if (missing.length) throw errors.integrationUnavailable("Phyllo", missing)
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
      const header = req.headers["webhook-signature"] ?? req.headers["x-phyllo-signature"]
      if (!verifyWebhookSignature(raw, Array.isArray(header) ? header.join(",") : header, process.env.PHYLLO_WEBHOOK_SECRET!))
        throw errors.unauthorized("Invalid webhook signature")
      let payload: { event?: string; name?: string; data?: Record<string, unknown> }
      try {
        payload = JSON.parse(raw.toString("utf8"))
      } catch {
        throw errors.badRequest("Webhook body is not valid JSON")
      }
      return ok(await withPhyllo(() => handlePhylloWebhook(payload)))
    })
  })

  app.get("/social/accounts/me", { preHandler: requireRole("CREATOR") }, async (req) => {
    const creator = await myCreator(req)
    const accounts = await prisma.socialAccount.findMany({ where: { creatorId: creator.id }, orderBy: { platform: "asc" } })
    return ok(accounts.map(accountDto))
  })

  app.post("/social/accounts/self-reported", { preHandler: requireRole("CREATOR") }, async (req, reply) => {
    const input = parse(selfReportedAccountBody, req.body)
    const creator = await myCreator(req)
    const { account, created } = await prisma.$transaction(async (tx) => {
      const existing = await tx.socialAccount.findUnique({ where: { creatorId_platform: { creatorId: creator.id, platform: input.platform } } })
      if (existing?.source === "PHYLLO" && existing.status !== "DISCONNECTED")
        throw errors.conflict("This platform is connected through Phyllo; verified data can't be overwritten with self-reported numbers", {
          socialAccountId: existing.id,
        })
      const base = {
        source: "SELF_REPORTED" as const,
        status: "CONNECTED" as const,
        handle: input.handle,
        profileUrl: input.profileUrl ?? null,
        externalAccountId: null,
        syncError: null,
        lastSyncedAt: new Date(),
      }
      const row = existing
        ? await tx.socialAccount.update({ where: { id: existing.id }, data: { ...base, audienceDemographics: Prisma.DbNull } })
        : await tx.socialAccount.create({ data: { creatorId: creator.id, platform: input.platform, ...base } })
      await applyMetrics(
        tx,
        { id: row.id, creatorId: creator.id, platform: row.platform, source: "SELF_REPORTED" },
        // Input ER is a percentage; stored as a fraction.
        { followers: input.followers, engagementRate: input.engagementRate / 100, avgViews: input.avgViews ?? null },
      )
      return { account: await tx.socialAccount.findUniqueOrThrow({ where: { id: row.id } }), created: !existing }
    })
    return reply.status(created ? 201 : 200).send(ok(accountDto(account)))
  })

  app.delete("/social/accounts/:id", { preHandler: requireRole("CREATOR") }, async (req) => {
    const { id } = parse(socialAccountIdParams, req.params)
    const creator = await myCreator(req)
    const account = await prisma.socialAccount.findUnique({ where: { id } })
    if (!account || account.creatorId !== creator.id) throw errors.notFound("Social account")
    if (account.source === "PHYLLO" && account.externalAccountId && phylloStatus().configured)
      await withPhyllo(() => phyllo.disconnectAccount(account.externalAccountId!))
    await prisma.socialAccount.delete({ where: { id } })
    const aggregate = await recomputeAndPublish(creator.id)
    return ok({ deleted: true, aggregate })
  })

  app.post("/social/accounts/me/sync", { preHandler: requireRole("CREATOR") }, async (req) => {
    assertPhylloConfigured()
    const creator = await myCreator(req)
    return ok(await withPhyllo(() => syncCreator(creator.id)))
  })

  app.get("/social/creators/:creatorId/metrics", { preHandler: internalOrUser }, async (req) => {
    const { creatorId } = parse(socialCreatorIdParams, req.params)
    const creator = await viewableCreator(req, creatorId)
    const accounts = await prisma.socialAccount.findMany({ where: { creatorId }, orderBy: { platform: "asc" } })
    const byId = new Map(accounts.map((a) => [a.id, a]))
    const snapshots = await prisma.socialMetricSnapshot.findMany({
      where: { socialAccountId: { in: accounts.map((a) => a.id) }, capturedAt: { gte: new Date(Date.now() - 90 * DAY_MS) } },
      orderBy: { capturedAt: "asc" },
    })
    const active = accounts.filter((a) => a.status !== "DISCONNECTED")
    const data: CreatorMetrics = {
      creatorId,
      aggregate: {
        followersTotal: creator.followersTotal,
        engagementRate: creator.engagementRate,
        followerGrowth30d: creator.followerGrowth30d,
        verifiedFollowers: active.filter((a) => a.source === "PHYLLO").reduce((s, a) => s + (a.followers ?? 0), 0),
        selfReportedFollowers: active.filter((a) => a.source === "SELF_REPORTED").reduce((s, a) => s + (a.followers ?? 0), 0),
        platformCount: active.length,
      },
      platforms: accounts.map(accountDto),
      snapshots: snapshots.map((s) => snapshotDto(s, byId.get(s.socialAccountId)!)),
      score: scoreDto(creator.score),
    }
    return ok(data)
  })

  app.get("/social/creators/:creatorId/demographics", { preHandler: internalOrUser }, async (req) => {
    const { creatorId } = parse(socialCreatorIdParams, req.params)
    await viewableCreator(req, creatorId)
    const accounts = await prisma.socialAccount.findMany({ where: { creatorId, status: { not: "DISCONNECTED" } }, orderBy: { platform: "asc" } })
    const data: CreatorDemographics = {
      creatorId,
      platforms: accounts.map((a) => ({
        socialAccountId: a.id,
        platform: a.platform,
        source: a.source,
        verified: a.source === "PHYLLO" && a.status === "CONNECTED",
        demographics: (a.audienceDemographics as Record<string, unknown> | null) ?? null,
        lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
      })),
    }
    return ok(data)
  })
}

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get("/admin/fraud-flags", { preHandler: requireRole("ADMIN") }, async (req) => {
    const q = parse(fraudFlagListQuery, req.query)
    const where: Prisma.FraudFlagWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.subject && { subject: q.subject }),
      ...(q.severity && { severity: q.severity }),
    }
    const [rows, total] = await Promise.all([
      prisma.fraudFlag.findMany({
        where,
        include: { creator: { select: { handle: true } } },
        orderBy: [{ createdAt: "desc" }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.fraudFlag.count({ where }),
    ])
    return ok(rows.map(fraudFlagDto), pageMeta(q, total))
  })

  app.post("/admin/fraud-flags/:id/review", { preHandler: requireRole("ADMIN") }, async (req) => {
    const { id } = parse(socialAccountIdParams, req.params)
    const input = parse(fraudFlagReviewBody, req.body)
    const flag = await prisma.fraudFlag.findUnique({ where: { id } })
    if (!flag) throw errors.notFound("Fraud flag")
    if (flag.status !== "OPEN") throw errors.conflict(`Flag was already reviewed (${flag.status})`)
    // Review only records the decision — no automatic bans or deletions.
    const updated = await prisma.fraudFlag.update({
      where: { id },
      data: { status: input.status, reviewerId: req.user!.id, reviewNote: input.note, reviewedAt: new Date() },
      include: { creator: { select: { handle: true } } },
    })
    return ok(fraudFlagDto(updated))
  })
}
