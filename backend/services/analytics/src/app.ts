import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify"
import { prisma } from "@hustl/db"
import { errors, internalOrUser, ok, pageMeta, parse, registerErrorHandler, requireRole } from "@hustl/common"
import { analyticsCampaignsQuery, analyticsDealIdParams, analyticsRangeQuery } from "@hustl/contracts"
import { adminMetrics, brandCampaigns, brandOverview, creatorOverview, dealAnalytics, dealReport, loadDeal } from "./queries"

async function callerBrand(req: FastifyRequest) {
  const brand = await prisma.brandProfile.findUnique({ where: { userId: req.user!.id }, select: { id: true, deletedAt: true } })
  if (!brand || brand.deletedAt) throw errors.notFound("Brand profile")
  return brand
}

async function callerCreator(req: FastifyRequest) {
  const creator = await prisma.creatorProfile.findUnique({ where: { userId: req.user!.id }, select: { id: true, userId: true, deletedAt: true } })
  if (!creator || creator.deletedAt) throw errors.notFound("Creator profile")
  return creator
}

/** Deal parties (brand or creator user), admins and internal services. */
async function partyDeal(req: FastifyRequest) {
  const { id } = parse(analyticsDealIdParams, req.params)
  const deal = await loadDeal(id)
  if (!deal) throw errors.notFound("Deal")
  const uid = req.user?.id
  if (!req.internal && req.user?.role !== "ADMIN" && uid !== deal.brand.userId && uid !== deal.creator.userId) throw errors.forbidden()
  return deal
}

export async function registerRoutes(app: FastifyInstance) {
  app.get("/analytics/brand/overview", { preHandler: requireRole("BRAND") }, async (req) => {
    const range = parse(analyticsRangeQuery, req.query)
    const brand = await callerBrand(req)
    return ok(await brandOverview(brand.id, range))
  })

  app.get("/analytics/brand/campaigns", { preHandler: requireRole("BRAND") }, async (req) => {
    const q = parse(analyticsCampaignsQuery, req.query)
    if (q.from && q.to && q.from > q.to) throw errors.validation("from must be before to")
    const brand = await callerBrand(req)
    const { items, total } = await brandCampaigns(brand.id, q, q)
    return ok(items, pageMeta(q, total))
  })

  app.get("/analytics/creator/overview", { preHandler: requireRole("CREATOR") }, async (req) => {
    const range = parse(analyticsRangeQuery, req.query)
    const creator = await callerCreator(req)
    return ok(await creatorOverview(creator, range))
  })

  app.get("/analytics/deals/:id", { preHandler: internalOrUser }, async (req) => ok(await dealAnalytics(await partyDeal(req))))

  app.get("/analytics/deals/:id/report", { preHandler: internalOrUser }, async (req) => ok(await dealReport(await partyDeal(req))))

  app.get("/admin/metrics", { preHandler: requireRole("ADMIN") }, async (req) => ok(await adminMetrics(parse(analyticsRangeQuery, req.query))))
}

/** App without listening — used by tests with `inject()`. */
export async function buildApp() {
  const app = Fastify({ logger: false })
  registerErrorHandler(app)
  await registerRoutes(app)
  await app.ready()
  return app
}
