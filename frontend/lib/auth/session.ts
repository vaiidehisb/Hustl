import "server-only"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import type { Role } from "@hustl/contracts"
import { portalPath } from "@/components/marketing/portal"
import { authOptions } from "./options"
import type { SessionUser } from "./refresh"

export { getAccessToken } from "./token"
export type { SessionUser }

export const portalHome = portalPath

export function getSession() {
  return getServerSession(authOptions)
}

/** The signed-in user, or null when anonymous or the session could not be refreshed. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getSession()
  if (!session?.user?.id || session.error) return null
  return session.user
}

export async function requireUser(callbackUrl?: string): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect(callbackUrl ? `/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/auth/signin")
  return user
}

/** Redirects to sign-in, onboarding (no role yet) or the user's own portal. */
export async function requireRole(role: Role | Role[], callbackUrl?: string): Promise<SessionUser & { role: Role }> {
  const user = await requireUser(callbackUrl)
  const allowed = Array.isArray(role) ? role : [role]
  if (!user.role) redirect("/onboarding")
  if (!allowed.includes(user.role)) redirect(portalHome(user.role))
  return user as SessionUser & { role: Role }
}
