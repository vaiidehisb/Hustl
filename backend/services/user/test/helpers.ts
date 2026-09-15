import "./setup-env"
import { randomBytes } from "node:crypto"
import type { FastifyInstance } from "fastify"
import { prisma, type UserRole, type UserStatus } from "@hustl/db"
import { signAccessToken } from "@hustl/common"
import type { AuthSession } from "@hustl/contracts"
import { expect } from "vitest"

// The test DB is shared with other services' suites running concurrently: every row we create uses
// random identifiers, and cleanup only removes the users this file created (profiles/tokens cascade).

export const uid = () => randomBytes(5).toString("hex")
export const PASSWORD = "Sturdy-passw0rd"

const created = new Set<string>()
export const track = (userId: string) => created.add(userId)

export async function cleanup() {
  if (created.size) await prisma.user.deleteMany({ where: { id: { in: [...created] } } })
  created.clear()
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` })
export const internalHeaders = () => ({ "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN! })

export const testEmail = (kind: string) => `${kind}.${uid()}@test.hustl.dev`

export async function registerCreator(app: FastifyInstance, overrides: Record<string, unknown> = {}) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: testEmail("creator"), password: PASSWORD, name: "Test Creator", role: "CREATOR", handle: `t_${uid()}`, ...overrides },
  })
  expect(res.statusCode, res.body).toBe(201)
  const session = res.json().data as AuthSession
  track(session.user.id)
  return session
}

export async function registerBrand(app: FastifyInstance, overrides: Record<string, unknown> = {}) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: testEmail("brand"), password: PASSWORD, name: "Test Brand Owner", role: "BRAND", companyName: `Acme ${uid()}`, ...overrides },
  })
  expect(res.statusCode, res.body).toBe(201)
  const session = res.json().data as AuthSession
  track(session.user.id)
  return session
}

/** A user inserted directly (e.g. admins, which can't self-register, or accounts without a role). */
export async function createUserDirect(role: UserRole | null, status: UserStatus = "ACTIVE") {
  const user = await prisma.user.create({ data: { email: testEmail(role?.toLowerCase() ?? "norole"), name: `Direct ${role ?? "none"}`, role, status } })
  track(user.id)
  return { user, token: signAccessToken({ id: user.id, email: user.email, role: user.role }) }
}
