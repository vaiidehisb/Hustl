import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { portalHome, requireUser } from "@/lib/auth/session"
import { AuthShell } from "@/components/marketing/auth/auth-shell"
import { OnboardingForm } from "@/components/marketing/auth/onboarding-form"

export const metadata: Metadata = { title: "Finish setting up" }
export const dynamic = "force-dynamic"

export default async function OnboardingPage() {
  const user = await requireUser("/onboarding")
  if (user.role) redirect(portalHome(user.role))
  return (
    <AuthShell>
      <OnboardingForm name={user.name} />
    </AuthShell>
  )
}
