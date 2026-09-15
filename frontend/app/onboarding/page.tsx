import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser, portalHome } from "@/lib/session"
import { AuthShell } from "@/components/marketing/auth/auth-shell"
import { OnboardingForm } from "@/components/marketing/auth/onboarding-form"

export const metadata: Metadata = { title: "Finish setting up" }
export const dynamic = "force-dynamic"

export default async function OnboardingPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/signin?callbackUrl=/onboarding")
  if (user.role) redirect(portalHome(user.role))
  return (
    <AuthShell>
      <OnboardingForm name={user.name} />
    </AuthShell>
  )
}
