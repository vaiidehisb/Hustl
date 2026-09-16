import { BadgeCheck, Sparkles, TrendingUp } from "lucide-react"
import { PageHeader, Panel } from "@/components/app/ui"
import { SocialsManager } from "@/components/creator/socials-manager"
import { VerificationPanel } from "@/components/creator/verification-panel"
import { BadgePanel } from "@/components/billing/badge-panel"
import { ErrorState } from "@/components/creator/states"
import { getBilling, getBillingProducts, getMe, getSocialAccounts, getSocialProviders, getVerifications, load, soft } from "../data"

export const metadata = { title: "Connect socials" }

const BENEFITS = [
  { icon: Sparkles, title: "Better matches", body: "Brief platforms and follower minimums are checked against the accounts on your profile." },
  { icon: TrendingUp, title: "Credible numbers", body: "Synced reach and engagement feed your niche authority and authenticity scores." },
  { icon: BadgeCheck, title: "Path to verified", body: "Connected socials plus an approved identity check earn the verified tick brands filter for." },
]

export default async function SettingsPage() {
  const [accountsResult, meResult] = await Promise.all([load(getSocialAccounts), load(getMe)])
  const [providers, verifications, products, billing] = await Promise.all([soft(getSocialProviders), soft(getVerifications), soft(getBillingProducts), soft(getBilling)])

  const verified = meResult.ok ? !!meResult.data.creator?.verifiedAt || meResult.data.user.kycStatus === "VERIFIED" : false

  return (
    <div>
      <PageHeader title="Connect socials" description="Link the accounts you create brand content on. Verified data comes from Phyllo; anything you type in stays labelled self-reported." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {accountsResult.ok ? <SocialsManager accounts={accountsResult.data} providers={providers} /> : <ErrorState error={accountsResult.error} />}
          <Panel
            className="mt-6"
            title="Verified Creator badge"
            description="Optional paid placement in brand discovery. Separate from the free identity check."
          >
            <BadgePanel products={products?.products ?? []} billing={billing} identityVerified={verified} />
          </Panel>
        </div>
        <aside className="space-y-6">
          <VerificationPanel verified={verified} requests={verifications ?? []} />
          <Panel title="Why connect?">
            <ul className="space-y-4">
              {BENEFITS.map((b) => (
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
          <p className="px-1 text-xs text-muted-foreground">We only read public profile stats and the insights you authorise. We never post on your behalf.</p>
        </aside>
      </div>
    </div>
  )
}
