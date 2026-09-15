"use server"

import { chooseRoleRequest, registerRequest, type Role } from "@hustl/contracts"
import { auth, users } from "@/lib/api"
import { isApiError } from "@/lib/api/errors"
import { toFormError, validationFailure, type FormResult } from "@/lib/api/form-errors"
import { toSessionUser } from "@/lib/auth/refresh"
import { readSessionToken, writeSessionToken } from "@/lib/auth/token"

/** POST /auth/register. The client then calls `signIn("credentials")` to start the session. */
export async function registerAction(input: unknown): Promise<FormResult<{ role: Role }>> {
  const parsed = registerRequest.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  try {
    const session = await auth.register(parsed.data)
    return { ok: true, data: { role: session.user.role ?? parsed.data.role } }
  } catch (err) {
    return toFormError(err)
  }
}

/**
 * POST /users/me/role for users without a role (Google sign-ups). The new access token
 * (carrying the role) is written into the session cookie; the client then calls `update()`.
 */
export async function completeOnboardingAction(input: unknown): Promise<FormResult<{ role: Role }>> {
  const parsed = chooseRoleRequest.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)

  const token = await readSessionToken()
  if (!token?.accessToken || token.error) return { ok: false, code: "UNAUTHORIZED", error: "Your session expired. Please log in again." }

  try {
    const res = await users.chooseRole(parsed.data, { token: token.accessToken })
    await writeSessionToken({
      ...token,
      user: toSessionUser(res.user),
      accessToken: res.accessToken,
      accessTokenExpiresAt: Date.parse(res.accessTokenExpiresAt),
      error: undefined,
    })
    return { ok: true, data: { role: res.user.role ?? parsed.data.role } }
  } catch (err) {
    // Role already chosen (e.g. double submit): sync the session with the server's view.
    if (isApiError(err) && err.status === 409 && !err.field) {
      try {
        const me = await users.me({ token: token.accessToken })
        if (me.user.role) {
          await writeSessionToken({ ...token, user: toSessionUser(me.user) })
          return { ok: true, data: { role: me.user.role } }
        }
      } catch {
        // fall through to the original error
      }
    }
    return toFormError(err)
  }
}
