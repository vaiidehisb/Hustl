import { redirect } from "next/navigation"
import { getSessionUser, portalHome } from "@/lib/auth/session"

export const dynamic = "force-dynamic"

export default async function DashboardRedirect() {
  const user = await getSessionUser()
  redirect(user ? portalHome(user.role) : "/auth/signin")
}
