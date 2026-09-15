import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { googleEnabled } from "@/lib/auth"
import { getCurrentUser, portalHome } from "@/lib/session"
import { SignUpForm } from "@/components/marketing/auth/signup-form"

export const metadata: Metadata = { title: "Create your account" }

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const [{ role }, user] = await Promise.all([searchParams, getCurrentUser()])
  if (user) redirect(portalHome(user.role))
  const initialRole = role?.toUpperCase() === "BRAND" ? "BRAND" : role?.toUpperCase() === "CREATOR" ? "CREATOR" : null
  return <SignUpForm googleEnabled={googleEnabled} initialRole={initialRole} />
}
