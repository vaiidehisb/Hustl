import "server-only"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

export async function getCurrentUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return null
  return db.user.findUnique({
    where: { email: session.user.email.toLowerCase() },
    include: { creator: true, brand: true },
  })
}

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/signin")
  return user
}

export async function requireBrand() {
  const user = await requireUser()
  if (user.role !== "BRAND" || !user.brand) redirect(user.role ? "/" : "/onboarding")
  return { user, brand: user.brand }
}

export async function requireCreator() {
  const user = await requireUser()
  if (user.role !== "CREATOR" || !user.creator) redirect(user.role ? "/" : "/onboarding")
  return { user, creator: user.creator }
}

export async function requireAdmin() {
  const user = await requireUser()
  if (user.role !== "ADMIN") redirect("/")
  return user
}

export const portalHome = (role: string | null | undefined) =>
  role === "BRAND" ? "/brand" : role === "CREATOR" ? "/creator" : role === "ADMIN" ? "/admin" : "/onboarding"
