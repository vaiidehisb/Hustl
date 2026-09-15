import { redirect } from "next/navigation"
import { getCurrentUser, portalHome } from "@/lib/session"

export default async function DashboardRedirect() {
  const user = await getCurrentUser()
  redirect(user ? portalHome(user.role) : "/auth/signin")
}
