import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/app/ui"
import { ProfileForm } from "@/components/creator/profile-form"
import type { PortfolioRow, RateCardRow } from "@/components/creator/lib"
import { json } from "@/lib/db"
import { requireCreator } from "@/lib/session"

export const metadata = { title: "Profile builder · hustl." }

export default async function ProfilePage() {
  const { user, creator } = await requireCreator()

  return (
    <div>
      <PageHeader
        title="Profile builder"
        description="Your profile powers brand search and every match score. Specific beats polished."
        actions={
          <Button variant="outline" asChild>
            <Link href={`/creators/${creator.handle}`} target="_blank">
              View public profile <ExternalLink className="size-4" />
            </Link>
          </Button>
        }
      />
      <ProfileForm
        initial={{
          handle: creator.handle,
          headline: creator.headline,
          bio: creator.bio,
          location: creator.location,
          niches: json<string[]>(creator.niches, []),
          languages: json<string[]>(creator.languages, []),
          available: creator.available,
          rateCard: json<RateCardRow[]>(creator.rateCard, []),
          portfolio: json<PortfolioRow[]>(creator.portfolio, []),
        }}
        name={user.name}
        avatarUrl={creator.avatarUrl ?? user.image}
        followers={creator.followers}
        engagementRate={creator.engagementRate}
        verified={creator.verified || user.kycVerified}
      />
    </div>
  )
}
