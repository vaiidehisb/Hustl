import bcrypt from "bcryptjs"
import { OAuth2Client, type TokenPayload } from "google-auth-library"
import { prisma, type Prisma, type User } from "@hustl/db"
import { errors, publish, TOPICS } from "@hustl/common"
import type { AuthSession, ChooseRoleRequest, ChooseRoleResponse, GoogleAuthResponse, LoginRequest, LogoutResponse, RegisterRequest } from "@hustl/contracts"
import { BCRYPT_COST, googleClientIds, REFRESH_TOKEN_TTL_MS } from "../config"
import { toPublicUser } from "../lib/mappers"
import { isUniqueViolation, uniqueTarget, withUniqueRetry } from "../lib/prisma-errors"
import { accessTokenFor, generateRefreshToken, hashToken } from "../lib/tokens"
import { createProfileForRole, isGeneratedIdentifierConflict } from "../repositories/users.repository"

export type ClientContext = { ip?: string; userAgent?: string }
type Tx = Prisma.TransactionClient

const invalidCredentials = () => errors.unauthorized("Invalid email or password")
const EMAIL_TAKEN = "An account with this email already exists"

// A real bcrypt hash compared against when the account doesn't exist, so response time doesn't reveal which emails are registered.
let dummyHash: Promise<string> | undefined
const getDummyHash = () => (dummyHash ??= bcrypt.hash("timing-equaliser-for-unknown-accounts", BCRYPT_COST))

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_COST)

/** Creates a refresh token row (hash only) and signs an access token. */
async function issueSession(tx: Tx, user: User, ctx: ClientContext): Promise<AuthSession> {
  const refreshToken = generateRefreshToken()
  const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
  await tx.refreshToken.create({
    data: { userId: user.id, tokenHash: hashToken(refreshToken), expiresAt: refreshTokenExpiresAt, ip: ctx.ip ?? null, userAgent: ctx.userAgent?.slice(0, 512) ?? null },
  })
  return { user: toPublicUser(user), ...accessTokenFor(user), refreshToken, refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString() }
}

export async function revokeAllRefreshTokens(userId: string, tx: Tx | typeof prisma = prisma) {
  await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
}

export async function register(input: RegisterRequest, ctx: ClientContext): Promise<AuthSession> {
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })
  if (existing) throw errors.conflict(EMAIL_TAKEN, { field: "email" })
  const passwordHash = await hashPassword(input.password)

  try {
    return await withUniqueRetry(
      () =>
        prisma.$transaction(async (tx) => {
          const user = await tx.user.create({ data: { email: input.email, name: input.name, passwordHash, role: input.role, lastLoginAt: new Date() } })
          const selection = input.role === "CREATOR" ? { role: input.role, handle: input.handle } : { role: input.role, companyName: input.companyName }
          const profile = await createProfileForRole(tx, user, selection)
          await publish(tx, TOPICS.USER_CREATED, user.id, {
            userId: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            provider: "password",
            creatorId: profile.creatorId,
            brandId: profile.brandId,
            handle: profile.handle,
            slug: profile.slug,
          })
          return issueSession(tx, user, ctx)
        }),
      isGeneratedIdentifierConflict(input.role === "CREATOR" && !!input.handle),
    )
  } catch (err) {
    if (isUniqueViolation(err)) {
      const target = uniqueTarget(err)
      if (target.includes("email")) throw errors.conflict(EMAIL_TAKEN, { field: "email" })
      if (target.includes("handle")) throw errors.conflict("That handle is already taken", { field: "handle" })
    }
    throw err
  }
}

export async function login(input: LoginRequest, ctx: ClientContext): Promise<AuthSession> {
  const user = await prisma.user.findUnique({ where: { email: input.email } })
  const valid = await bcrypt.compare(input.password, user?.passwordHash ?? (await getDummyHash()))
  if (!user || !user.passwordHash || !valid || user.deletedAt) throw invalidCredentials()
  // Only reveal suspension to someone who proved they own the account.
  if (user.status === "SUSPENDED") throw errors.forbidden("This account is suspended")
  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    return issueSession(tx, updated, ctx)
  })
}

class RefreshTokenReuse extends Error {}

/**
 * Browsers often fire two refreshes with the same token at once (parallel
 * requests, middleware + page). A token rotated moments ago is therefore
 * accepted again inside this window instead of being treated as stolen.
 */
export const REFRESH_ROTATION_GRACE_MS = 30_000
const withinGrace = (rotatedAt: Date | null) => !!rotatedAt && Date.now() - rotatedAt.getTime() < REFRESH_ROTATION_GRACE_MS

/** Single-use rotation. Presenting an already-revoked token (outside the grace window) means it leaked: every session of that user is revoked. */
export async function refresh(refreshToken: string, ctx: ClientContext): Promise<AuthSession> {
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) }, include: { user: true } })
  if (!row) throw errors.unauthorized("Invalid refresh token")

  const reuseDetected = async () => {
    await revokeAllRefreshTokens(row.userId)
    return errors.unauthorized("Refresh token was already used; all sessions have been signed out")
  }
  const graceSession = () => prisma.$transaction((tx) => issueSession(tx, row.user, ctx))
  const usable = !row.user.deletedAt && row.user.status !== "SUSPENDED"
  if (row.revokedAt) {
    if (usable && withinGrace(row.rotatedAt)) return graceSession()
    throw await reuseDetected()
  }
  if (row.expiresAt.getTime() <= Date.now()) throw errors.unauthorized("Refresh token expired")
  if (row.user.deletedAt) {
    await revokeAllRefreshTokens(row.userId)
    throw errors.unauthorized("Account not found")
  }
  if (row.user.status === "SUSPENDED") {
    await revokeAllRefreshTokens(row.userId)
    throw errors.forbidden("This account is suspended")
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // Conditional update: of two concurrent refreshes with the same token only one can win.
      const now = new Date()
      const { count } = await tx.refreshToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: now, rotatedAt: now } })
      if (count !== 1) throw new RefreshTokenReuse()
      return issueSession(tx, row.user, ctx)
    })
  } catch (err) {
    if (err instanceof RefreshTokenReuse) {
      // Lost a race with a concurrent refresh of the same token: fine if that one was a rotation just now.
      const current = await prisma.refreshToken.findUnique({ where: { id: row.id }, select: { rotatedAt: true } })
      if (usable && withinGrace(current?.rotatedAt ?? null)) return graceSession()
      throw await reuseDetected()
    }
    throw err
  }
}

export async function logout(refreshToken: string): Promise<LogoutResponse> {
  await prisma.refreshToken.updateMany({ where: { tokenHash: hashToken(refreshToken), revokedAt: null }, data: { revokedAt: new Date() } })
  return { loggedOut: true }
}

const googleClients = new Map<string, OAuth2Client>()

async function verifyGoogleIdToken(idToken: string): Promise<TokenPayload> {
  const audience = googleClientIds()
  if (!audience.length) throw errors.integrationUnavailable("Google sign-in", ["GOOGLE_CLIENT_ID"])
  const key = audience.join(",")
  let client = googleClients.get(key)
  if (!client) googleClients.set(key, (client = new OAuth2Client()))
  let payload: TokenPayload | undefined
  try {
    payload = (await client.verifyIdToken({ idToken, audience })).getPayload()
  } catch {
    throw errors.unauthorized("Invalid Google credential")
  }
  if (!payload?.sub || !payload.email) throw errors.unauthorized("Invalid Google credential")
  if (!payload.email_verified) throw errors.unauthorized("Your Google email address is not verified")
  return payload
}

export async function googleSignIn(idToken: string, ctx: ClientContext): Promise<GoogleAuthResponse> {
  const g = await verifyGoogleIdToken(idToken)
  const email = g.email!.trim().toLowerCase()
  let isNewUser = false

  let user = await prisma.user.findUnique({ where: { googleId: g.sub } })
  if (!user) {
    const byEmail = await prisma.user.findUnique({ where: { email } })
    if (byEmail) {
      if (byEmail.googleId && byEmail.googleId !== g.sub) throw errors.conflict("This email is linked to a different Google account")
      // Google has verified ownership of the address, so linking to the existing account is safe.
      user = await prisma.user.update({ where: { id: byEmail.id }, data: { googleId: g.sub, image: byEmail.image ?? g.picture ?? null } })
    }
  }
  if (!user) {
    try {
      user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { email, googleId: g.sub, name: (g.name ?? email.split("@")[0]!).slice(0, 100), image: g.picture ?? null, role: null },
        })
        await publish(tx, TOPICS.USER_CREATED, created.id, { userId: created.id, email: created.email, name: created.name, role: null, provider: "google" })
        return created
      })
      isNewUser = true
    } catch (err) {
      // A concurrent sign-in with the same Google account created it first.
      if (!isUniqueViolation(err)) throw err
      user = await prisma.user.findUnique({ where: { googleId: g.sub } })
      if (!user) throw errors.conflict(EMAIL_TAKEN)
    }
  }

  if (user.deletedAt) throw errors.unauthorized("Account not found")
  if (user.status === "SUSPENDED") throw errors.forbidden("This account is suspended")
  const signedIn = user
  const session = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id: signedIn.id }, data: { lastLoginAt: new Date() } })
    return issueSession(tx, updated, ctx)
  })
  return { ...session, isNewUser }
}

/** One-time role selection for accounts created without one (Google sign-up). */
export async function chooseRole(userId: string, sel: ChooseRoleRequest): Promise<ChooseRoleResponse> {
  const explicitHandle = sel.role === "CREATOR" && !!sel.handle
  return withUniqueRetry(
    () =>
      prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId } })
        if (!user || user.deletedAt) throw errors.unauthorized("Account not found")
        if (user.status === "SUSPENDED") throw errors.forbidden("This account is suspended")
        if (user.role) throw errors.conflict("Your account already has a role")
        const { count } = await tx.user.updateMany({ where: { id: userId, role: null }, data: { role: sel.role } })
        if (count !== 1) throw errors.conflict("Your account already has a role")
        const profile = await createProfileForRole(tx, user, sel)
        if (profile.creatorId)
          await publish(tx, TOPICS.CREATOR_PROFILE_UPDATED, profile.creatorId, { creatorId: profile.creatorId, userId, handle: profile.handle, changedFields: ["created"] })
        if (profile.brandId)
          await publish(tx, TOPICS.BRAND_PROFILE_UPDATED, profile.brandId, { brandId: profile.brandId, userId, slug: profile.slug, changedFields: ["created"] })
        const updated = await tx.user.findUniqueOrThrow({ where: { id: userId } })
        return { user: toPublicUser(updated), ...accessTokenFor(updated) }
      }),
    isGeneratedIdentifierConflict(explicitHandle),
  ).catch((err) => {
    if (isUniqueViolation(err) && uniqueTarget(err).includes("handle")) throw errors.conflict("That handle is already taken", { field: "handle" })
    throw err
  })
}
