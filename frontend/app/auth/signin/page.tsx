import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { googleEnabled } from "@/lib/auth"
import { getCurrentUser, portalHome } from "@/lib/session"
import { SignInForm } from "@/components/marketing/auth/signin-form"

export const metadata: Metadata = { title: "Log in" }

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const [{ callbackUrl, error }, user] = await Promise.all([searchParams, getCurrentUser()])
  if (user) redirect(portalHome(user.role))
  return <SignInForm googleEnabled={googleEnabled} callbackUrl={callbackUrl} initialError={error} />
}
