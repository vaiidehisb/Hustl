import type { FastifyInstance, FastifyRequest } from "fastify"
import { ok, parse } from "@hustl/common"
import { googleAuthRequest, loginRequest, logoutRequest, refreshRequest, registerRequest } from "@hustl/contracts"
import * as auth from "../services/auth.service"

export const clientContext = (req: FastifyRequest): auth.ClientContext => ({ ip: req.ip, userAgent: req.headers["user-agent"] })

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", async (req, reply) => {
    const session = await auth.register(parse(registerRequest, req.body), clientContext(req))
    return reply.status(201).send(ok(session))
  })

  app.post("/auth/login", async (req) => ok(await auth.login(parse(loginRequest, req.body), clientContext(req))))

  app.post("/auth/refresh", async (req) => ok(await auth.refresh(parse(refreshRequest, req.body).refreshToken, clientContext(req))))

  app.post("/auth/logout", async (req) => ok(await auth.logout(parse(logoutRequest, req.body).refreshToken)))

  app.post("/auth/google", async (req) => ok(await auth.googleSignIn(parse(googleAuthRequest, req.body).idToken, clientContext(req))))
}
