import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/app/ui"
import { ProfileForm } from "@/components/creator/profile-form"
import { ErrorState } from "@/components/creator/states"
import { getMe, load } from "../data"

export const metadata = { title: "Profile builder · hustl." }

export default async function ProfilePage() {
  const result = await load(getMe)

  if (!result.ok) {
    return (
      <div>
        <PageHeader title="Profile builder" />
        <ErrorState error={result.error} />
      </div>
    )
  }

  const { user, creator } = result.data
  if (!creator) {
    return (
      <div>
        <PageHeader title="Profile builder" />
        <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          Your creator profile hasn&apos;t been created yet. Finish onboarding and come back — nothing is lost.
        </p>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Profile builder"
        description="Your profile powers brand search and every fit score. Specific beats polished."
        actions={
          <Button variant="outline" asChild>
            <Link href={`/creators/${creator.handle}`} target="_blank">
              View public profile <ExternalLink className="size-4" />
            </Link>
          </Button>
        }
      />
      <ProfileForm
        profile={creator}
        name={user.name}
        followersTotal={creator.followersTotal}
        engagementRate={creator.engagementRate}
        verified={!!creator.verifiedAt || user.kycStatus === "VERIFIED"}
      />
    </div>
  )
}
