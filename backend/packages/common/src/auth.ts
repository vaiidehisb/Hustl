import type { FastifyReply, FastifyRequest } from "fastify"
import jwt from "jsonwebtoken"
import { errors } from "./errors"

export type Role = "BRAND" | "CREATOR" | "ADMIN"
export type AuthUser = { id: string; email: string; role: Role | null }

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser
    internal?: boolean
  }
}

const ISSUER = "hustl.user-service"
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60

const secret = () => {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error("JWT_SECRET is not set")
  return s
}

export function signAccessToken(user: AuthUser) {
  return jwt.sign({ email: user.email, role: user.role }, secret(), {
    subject: user.id,
    issuer: ISSUER,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  })
}

export function verifyAccessToken(token: string): AuthUser {
  try {
    const p = jwt.verify(token, secret(), { issuer: ISSUER }) as jwt.JwtPayload
    return { id: p.sub as string, email: p.email as string, role: (p.role as Role | null) ?? null }
  } catch (err) {
    throw errors.unauthorized(err instanceof jwt.TokenExpiredError ? "Access token expired" : "Invalid access token")
  }
}

function bearer(req: FastifyRequest) {
  const h = req.headers.authorization
  return h?.startsWith("Bearer ") ? h.slice(7) : undefined
}

function isInternal(req: FastifyRequest) {
  const token = req.headers["x-internal-token"]
  return !!token && token === process.env.INTERNAL_SERVICE_TOKEN
}

/** preHandler: requires a valid user access token. */
export async function authenticate(req: FastifyRequest) {
  const token = bearer(req)
  if (!token) throw errors.unauthorized()
  req.user = verifyAccessToken(token)
}

/** preHandler: attaches the user when a token is present, never rejects. */
export async function optionalAuth(req: FastifyRequest) {
  const token = bearer(req)
  if (token) {
    try {
      req.user = verifyAccessToken(token)
    } catch {
      req.user = undefined
    }
  }
}

export const requireRole =
  (...roles: Role[]) =>
  async (req: FastifyRequest) => {
    await authenticate(req)
    if (!req.user?.role || !roles.includes(req.user.role)) throw errors.forbidden()
  }

/** preHandler for service-to-service endpoints (never exposed through the gateway). */
export async function requireInternal(req: FastifyRequest, _reply?: FastifyReply) {
  if (!isInternal(req)) throw errors.forbidden("Internal endpoint")
  req.internal = true
}

/** Accepts either an internal service call or an authenticated user. */
export async function internalOrUser(req: FastifyRequest) {
  if (isInternal(req)) {
    req.internal = true
    return
  }
  await authenticate(req)
}
