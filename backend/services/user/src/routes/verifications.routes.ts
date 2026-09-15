import type { FastifyInstance } from "fastify"
import { authenticate, ok, parse } from "@hustl/common"
import { createVerificationRequest } from "@hustl/contracts"
import { listMyVerifications, submitVerification } from "../services/verifications.service"

export async function verificationRoutes(app: FastifyInstance) {
  app.post("/verifications", { preHandler: authenticate }, async (req, reply) => {
    const created = await submitVerification(req.user!.id, parse(createVerificationRequest, req.body))
    return reply.status(201).send(ok(created))
  })

  app.get("/verifications/me", { preHandler: authenticate }, async (req) => ok(await listMyVerifications(req.user!.id)))
}
