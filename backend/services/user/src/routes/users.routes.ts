import type { FastifyInstance } from "fastify"
import { authenticate, ok, parse } from "@hustl/common"
import { chooseRoleRequest, updateMeRequest } from "@hustl/contracts"
import { chooseRole } from "../services/auth.service"
import { getMe, updateMe } from "../services/users.service"

export async function usersRoutes(app: FastifyInstance) {
  app.get("/users/me", { preHandler: authenticate }, async (req) => ok(await getMe(req.user!.id)))

  app.patch("/users/me", { preHandler: authenticate }, async (req) => ok(await updateMe(req.user!.id, parse(updateMeRequest, req.body))))

  app.post("/users/me/role", { preHandler: authenticate }, async (req) => ok(await chooseRole(req.user!.id, parse(chooseRoleRequest, req.body))))
}
