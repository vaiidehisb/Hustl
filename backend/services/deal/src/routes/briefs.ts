import type { FastifyInstance } from "fastify"
import { ok, optionalAuth, parse, requireRole } from "@hustl/common"
import {
  applicationsQuery,
  briefIdParams,
  briefMatchesQuery,
  createApplicationRequest,
  createBriefRequest,
  myBriefsQuery,
  openBriefsQuery,
  parseBriefRequest,
  updateBriefRequest,
} from "@hustl/contracts"
import { apply, briefApplications } from "../services/applications"
import { briefFit, briefMatches, closeBrief, createBrief, deleteBrief, getBrief, myBriefs, openBriefs, parseBrief, publishBrief, updateBrief } from "../services/briefs"

export async function briefRoutes(app: FastifyInstance) {
  const brand = { preHandler: requireRole("BRAND") }
  const creator = { preHandler: requireRole("CREATOR") }

  app.post("/briefs", brand, async (req, reply) => reply.status(201).send(ok(await createBrief(req.user!, parse(createBriefRequest, req.body)))))

  app.get("/briefs/mine", brand, async (req) => {
    const { items, meta } = await myBriefs(req.user!, parse(myBriefsQuery, req.query))
    return ok(items, meta)
  })

  app.get("/briefs/open", { preHandler: optionalAuth }, async (req) => {
    const { items, meta } = await openBriefs(req.user, parse(openBriefsQuery, req.query))
    return ok(items, meta)
  })

  app.post("/briefs/parse", brand, async (req) => ok(await parseBrief(parse(parseBriefRequest, req.body).text)))

  app.get("/briefs/:id", { preHandler: optionalAuth }, async (req) => ok(await getBrief(req.user, parse(briefIdParams, req.params).id)))

  app.patch("/briefs/:id", brand, async (req) => {
    const { brief, meta } = await updateBrief(req.user!, parse(briefIdParams, req.params).id, parse(updateBriefRequest, req.body))
    return ok(brief, meta)
  })

  app.delete("/briefs/:id", brand, async (req) => ok(await deleteBrief(req.user!, parse(briefIdParams, req.params).id)))

  app.post("/briefs/:id/publish", brand, async (req) => {
    const { brief, meta } = await publishBrief(req.user!, parse(briefIdParams, req.params).id)
    return ok(brief, meta)
  })

  app.post("/briefs/:id/close", brand, async (req) => ok(await closeBrief(req.user!, parse(briefIdParams, req.params).id)))

  app.get("/briefs/:id/matches", brand, async (req) => {
    const { id } = parse(briefIdParams, req.params)
    return ok(await briefMatches(req.user!, id, parse(briefMatchesQuery, req.query).limit))
  })

  app.get("/briefs/:id/fit", creator, async (req) => ok(await briefFit(req.user!, parse(briefIdParams, req.params).id)))

  app.post("/briefs/:id/applications", creator, async (req, reply) => {
    const { application, meta } = await apply(req.user!, parse(briefIdParams, req.params).id, parse(createApplicationRequest, req.body))
    return reply.status(201).send(ok(application, meta))
  })

  app.get("/briefs/:id/applications", brand, async (req) => {
    const { items, meta } = await briefApplications(req.user!, parse(briefIdParams, req.params).id, parse(applicationsQuery, req.query))
    return ok(items, meta)
  })
}
