import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { ok, parse, requireInternal } from "@hustl/common"
import { internalUsersBatchRequest } from "@hustl/contracts"
import * as internal from "../services/internal.service"

const idParams = z.object({ id: z.string().uuid() })
const userIdParams = z.object({ userId: z.string().uuid() })

/** Service-to-service only (x-internal-token). The gateway never exposes /internal/*. */
export async function internalRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireInternal)

  app.get("/internal/users/:id", async (req) => ok(await internal.getInternalUser(parse(idParams, req.params).id)))

  app.post("/internal/users/batch", async (req) => ok(await internal.getInternalUsers(parse(internalUsersBatchRequest, req.body).ids)))

  app.get("/internal/creators/by-user/:userId", async (req) => ok(await internal.getInternalCreator({ userId: parse(userIdParams, req.params).userId })))

  app.get("/internal/creators/:id", async (req) => ok(await internal.getInternalCreator({ id: parse(idParams, req.params).id })))

  app.get("/internal/brands/by-user/:userId", async (req) => ok(await internal.getInternalBrand({ userId: parse(userIdParams, req.params).userId })))

  app.get("/internal/brands/:id", async (req) => ok(await internal.getInternalBrand({ id: parse(idParams, req.params).id })))
}
