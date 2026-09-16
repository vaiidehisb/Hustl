import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { googleEnabled } from "@/lib/auth/options"
import { getSessionUser, portalHome } from "@/lib/auth/session"
import { SignInForm } from "@/components/marketing/auth/signin-form"

export const metadata: Metadata = { title: "Log in" }

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string; expired?: string }> }) {
  const [{ callbackUrl, error, expired }, user] = await Promise.all([searchParams, getSessionUser()])
  if (user) redirect(portalHome(user.role))
  return <SignInForm googleEnabled={googleEnabled} callbackUrl={callbackUrl} initialError={error} expired={expired === "1"} />
}
