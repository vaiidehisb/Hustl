// Auth contracts — served by user-service (see backend/API.md).
import { z } from "zod"
import { handle, password, type Role } from "./common"

/** Emails are compared case-insensitively: always trimmed + lowercased. */
export const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(254)

const personName = z.string().trim().min(1, "Name is required").max(100)
export const companyName = z.string().trim().min(2, "Company name must be at least 2 characters").max(120)

const creatorSignup = z.object({ role: z.literal("CREATOR"), handle: handle.optional() })
const brandSignup = z.object({ role: z.literal("BRAND"), companyName })

// ─── Requests ────────────────────────────────────────────────────────────────

/** POST /auth/register. Creators may pick a handle (derived from the name when omitted); brands must give a company name. */
export const registerRequest = z.discriminatedUnion("role", [
  creatorSignup.extend({ email, password, name: personName }),
  brandSignup.extend({ email, password, name: personName }),
])
export type RegisterRequest = z.infer<typeof registerRequest>

/** POST /auth/login. The password isn't re-validated against the policy so legacy passwords still work. */
export const loginRequest = z.object({ email, password: z.string().min(1, "Password is required").max(128) })
export type LoginRequest = z.infer<typeof loginRequest>

/** POST /auth/refresh */
export const refreshRequest = z.object({ refreshToken: z.string().min(32).max(256) })
export type RefreshRequest = z.infer<typeof refreshRequest>

/** POST /auth/logout */
export const logoutRequest = refreshRequest
export type LogoutRequest = RefreshRequest

/** POST /auth/google */
export const googleAuthRequest = z.object({ idToken: z.string().min(20).max(4096) })
export type GoogleAuthRequest = z.infer<typeof googleAuthRequest>

/** POST /users/me/role, allowed only while the user has no role (e.g. after Google sign-up). */
export const chooseRoleRequest = z.discriminatedUnion("role", [creatorSignup, brandSignup])
export type ChooseRoleRequest = z.infer<typeof chooseRoleRequest>

/** PATCH /users/me */
export const updateMeRequest = z
  .object({
    name: personName.optional(),
    image: z.string().trim().url().max(2048).refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) URL").nullable().optional(),
  })
  .strict()
export type UpdateMeRequest = z.infer<typeof updateMeRequest>

// ─── Responses ───────────────────────────────────────────────────────────────

export type UserStatus = "ACTIVE" | "SUSPENDED"
export type KycStatus = "NONE" | "PENDING" | "VERIFIED" | "REJECTED"

/** The authenticated user's own account (never includes secrets). */
export type PublicUser = {
  id: string
  email: string
  name: string
  image: string | null
  role: Role | null
  status: UserStatus
  kycStatus: KycStatus
  hasPassword: boolean
  googleLinked: boolean
  lastLoginAt: string | null
  createdAt: string
}

/** Returned by register, login, refresh and google. Access tokens last 15 min, refresh tokens 30 days (single use). */
export type AuthSession = {
  user: PublicUser
  accessToken: string
  accessTokenExpiresAt: string
  refreshToken: string
  refreshTokenExpiresAt: string
}

/** POST /auth/google. When `isNewUser` is true and `user.role` is null, send the user to role selection. */
export type GoogleAuthResponse = AuthSession & { isNewUser: boolean }

/** POST /users/me/role. A new access token carrying the role; the refresh token stays valid. */
export type ChooseRoleResponse = { user: PublicUser; accessToken: string; accessTokenExpiresAt: string }

export type LogoutResponse = { loggedOut: true }
