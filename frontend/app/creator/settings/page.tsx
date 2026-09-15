import { BadgeCheck, ShieldCheck, Sparkles, TrendingUp } from "lucide-react"
import { PageHeader, Panel } from "@/components/app/ui"
import { SocialsManager } from "@/components/creator/socials-manager"
import type { SocialAccount } from "@/components/creator/lib"
import { json } from "@/lib/db"
import { requireCreator } from "@/lib/session"

export const metadata = { title: "Connect socials · hustl." }

export default async function SettingsPage() {
  const { user, creator } = await requireCreator()
  const accounts = json<SocialAccount[]>(creator.platforms, [])

  const benefits = [
    { icon: Sparkles, title: "Better matches", body: "Brief platforms and follower minimums are checked against your connected accounts." },
    { icon: TrendingUp, title: "Credible numbers", body: "Synced reach and engagement feed your niche authority and authenticity scores." },
    { icon: BadgeCheck, title: "Path to verified", body: "Connected socials plus KYC earn the verified badge brands filter for." },
  ]

  return (
    <div>
      <PageHeader title="Connect socials" description="Link the accounts you create brand content on. Your totals and scores update every time you sync." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <SocialsManager accounts={accounts} lastSyncedAt={creator.lastSyncedAt?.toISOString() ?? null} />
        <aside className="space-y-6">
          <Panel title="Why connect?">
            <ul className="space-y-4">
              {benefits.map((b) => (
                <li key={b.title} className="flex gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
                    <b.icon className="size-4" />
                  </span>
                  <div>
                    <div className="text-sm font-medium">{b.title}</div>
                    <p className="text-xs text-muted-foreground">{b.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Verification">
            <div className="flex items-start gap-3">
              <ShieldCheck className={`mt-0.5 size-5 shrink-0 ${creator.verified || user.kycVerified ? "text-success" : "text-muted-foreground"}`} />
              <p className="text-sm text-muted-foreground">
                {creator.verified || user.kycVerified
                  ? "You're verified. Brands see the badge on your profile and applications."
                  : creator.socialsConnected
                    ? "Socials connected. Verification completes after KYC is reviewed by the hustl. team."
                    : "Connect at least one account to start verification."}
              </p>
            </div>
          </Panel>
          <p className="px-1 text-xs text-muted-foreground">
            We only read public profile stats and insights you authorise. We never post on your behalf.
          </p>
        </aside>
      </div>
    </div>
  )
}
