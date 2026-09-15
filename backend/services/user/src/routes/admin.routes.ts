import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { ok, parse, requireRole } from "@hustl/common"
import { adminUsersQuery, adminUserStatusRequest, adminVerificationsQuery, verificationDecisionRequest } from "@hustl/contracts"
import * as admin from "../services/admin.service"

const idParams = z.object({ id: z.string().uuid() })

export async function adminRoutes(app: FastifyInstance) {
  // Every route in this scope is admin-only.
  app.addHook("preHandler", requireRole("ADMIN"))

  app.get("/admin/users", async (req) => {
    const { items, meta } = await admin.listUsers(parse(adminUsersQuery, req.query))
    return ok(items, meta)
  })

  app.patch("/admin/users/:id/status", async (req) =>
    ok(await admin.setUserStatus(req.user!.id, parse(idParams, req.params).id, parse(adminUserStatusRequest, req.body))),
  )

  app.get("/admin/verifications", async (req) => {
    const { items, meta } = await admin.listVerifications(parse(adminVerificationsQuery, req.query))
    return ok(items, meta)
  })

  app.post("/admin/verifications/:id/decision", async (req) =>
    ok(await admin.decideVerification(req.user!.id, parse(idParams, req.params).id, parse(verificationDecisionRequest, req.body))),
  )
}
