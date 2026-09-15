import type { FastifyInstance } from "fastify"
import { authenticate, ok, parse, requireInternal, requireRole } from "@hustl/common"
import {
  applicationScoreResult,
  applicationsQuery,
  briefIdParams,
  counterOfferRequest,
  createDisputeRequest,
  createOfferRequest,
  createReviewRequest,
  dealParams,
  dealStatusActionRequest,
  listDealsQuery,
  milestoneParams,
  reasonRequest,
  requestRevisionRequest,
  signContractRequest,
  submitMilestoneRequest,
  updateApplicationStatusRequest,
} from "@hustl/contracts"
import { myApplications, persistScore, setApplicationStatus, withdrawApplication } from "../services/applications"
import { embedBrief } from "../services/briefs"
import { createReview, dealDetail, getContract, internalDeal, listDeals, participants } from "../services/deals"
import { raiseDispute } from "../services/disputes"
import { approveMilestone, requestRevision, retryRelease, submitMilestone } from "../services/milestones"
import { acceptOffer, cancelDeal, counterOffer, createOffer, declineOffer, signContract } from "../services/offers"

export async function applicationRoutes(app: FastifyInstance) {
  app.get("/applications/mine", { preHandler: requireRole("CREATOR") }, async (req) => {
    const { items, meta } = await myApplications(req.user!, parse(applicationsQuery, req.query))
    return ok(items, meta)
  })
  app.post("/applications/:id/withdraw", { preHandler: requireRole("CREATOR") }, async (req) => ok(await withdrawApplication(req.user!, parse(briefIdParams, req.params).id)))
  app.patch("/applications/:id/status", { preHandler: requireRole("BRAND") }, async (req) =>
    ok(await setApplicationStatus(req.user!, parse(briefIdParams, req.params).id, parse(updateApplicationStatusRequest, req.body).status)),
  )
}

export async function dealRoutes(app: FastifyInstance) {
  const auth = { preHandler: authenticate }

  app.post("/deals", { preHandler: requireRole("BRAND") }, async (req, reply) => {
    const id = await createOffer(req.user!, parse(createOfferRequest, req.body))
    return reply.status(201).send(ok(await dealDetail(req.user!, id)))
  })

  app.get("/deals", auth, async (req) => {
    const { items, meta } = await listDeals(req.user!, parse(listDealsQuery, req.query))
    return ok(items, meta)
  })

  app.get("/deals/:id", auth, async (req) => ok(await dealDetail(req.user!, parse(dealParams, req.params).id)))

  app.post("/deals/:id/counter", auth, async (req) => {
    const { id } = parse(dealParams, req.params)
    await counterOffer(req.user!, id, parse(counterOfferRequest, req.body))
    return ok(await dealDetail(req.user!, id))
  })

  app.post("/deals/:id/accept", auth, async (req) => {
    const { id } = parse(dealParams, req.params)
    await acceptOffer(req.user!, id)
    return ok(await dealDetail(req.user!, id))
  })

  app.post("/deals/:id/decline", auth, async (req) => {
    const { id } = parse(dealParams, req.params)
    await declineOffer(req.user!, id, parse(reasonRequest, req.body ?? {}).reason)
    return ok(await dealDetail(req.user!, id))
  })

  app.post("/deals/:id/cancel", auth, async (req) => {
    const { id } = parse(dealParams, req.params)
    await cancelDeal(req.user!, id, parse(reasonRequest, req.body ?? {}).reason)
    return ok(await dealDetail(req.user!, id))
  })

  app.patch("/deals/:id/status", auth, async (req) => {
    const { id } = parse(dealParams, req.params)
    const body = parse(dealStatusActionRequest, req.body)
    switch (body.action) {
      case "ACCEPT":
        await acceptOffer(req.user!, id)
        break
      case "DECLINE":
        await declineOffer(req.user!, id, body.reason)
        break
      case "CANCEL":
        await cancelDeal(req.user!, id, body.reason)
        break
      case "COUNTER":
        await counterOffer(req.user!, id, body.offer)
        break
      case "SIGN":
        await signContract(req.user!, id, { signerName: body.signerName, bodyHash: body.bodyHash }, req.ip)
        break
    }
    return ok(await dealDetail(req.user!, id))
  })

  app.get("/deals/:id/contract", auth, async (req) => ok(await getContract(req.user!, parse(dealParams, req.params).id)))

  app.post("/deals/:id/contract/sign", auth, async (req) => {
    const { id } = parse(dealParams, req.params)
    await signContract(req.user!, id, parse(signContractRequest, req.body), req.ip)
    return ok(await dealDetail(req.user!, id))
  })

  app.post("/deals/:id/milestones/:mid/submit", auth, async (req) => {
    const { id, mid } = parse(milestoneParams, req.params)
    await submitMilestone(req.user!, id, mid, parse(submitMilestoneRequest, req.body))
    return ok(await dealDetail(req.user!, id))
  })

  app.post("/deals/:id/milestones/:mid/approve", auth, async (req) => {
    const { id, mid } = parse(milestoneParams, req.params)
    const release = await approveMilestone(req.user!, id, mid)
    return ok(await dealDetail(req.user!, id), { release })
  })

  app.post("/deals/:id/milestones/:mid/request-revision", auth, async (req) => {
    const { id, mid } = parse(milestoneParams, req.params)
    await requestRevision(req.user!, id, mid, parse(requestRevisionRequest, req.body))
    return ok(await dealDetail(req.user!, id))
  })

  app.post("/deals/:id/disputes", auth, async (req, reply) => {
    const { id } = parse(dealParams, req.params)
    const dispute = await raiseDispute(req.user!, id, parse(createDisputeRequest, req.body))
    return reply.status(201).send(ok(await dealDetail(req.user!, id), { dispute }))
  })

  app.post("/deals/:id/reviews", auth, async (req, reply) => {
    const { id } = parse(dealParams, req.params)
    return reply.status(201).send(ok(await createReview(req.user!, id, parse(createReviewRequest, req.body))))
  })
}

export async function internalRoutes(app: FastifyInstance) {
  const internal = { preHandler: requireInternal }
  app.get("/internal/deals/:id", internal, async (req) => ok(await internalDeal(parse(dealParams, req.params).id)))
  app.get("/internal/deals/:id/participants", internal, async (req) => ok(await participants(parse(dealParams, req.params).id)))
  app.post("/internal/deals/:id/milestones/:mid/retry-release", internal, async (req) => {
    const { id, mid } = parse(milestoneParams, req.params)
    return ok(await retryRelease(id, mid))
  })
  app.post("/internal/applications/:id/score", internal, async (req) => ok(await persistScore(parse(briefIdParams, req.params).id, parse(applicationScoreResult, req.body))))
  app.post("/internal/briefs/:id/embed", internal, async (req) => ok({ aiEmbedding: await embedBrief(parse(briefIdParams, req.params).id) }))
}
