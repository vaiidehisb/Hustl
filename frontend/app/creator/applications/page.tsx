import Link from "next/link"
import { ArrowRight, Archive, Gift, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, EmptyState, PageHeader, ScoreRing, StatusBadge } from "@/components/app/ui"
import { WithdrawButton } from "@/components/creator/withdraw-button"
import { db } from "@/lib/db"
import { inr, timeAgo } from "@/lib/format"
import { requireCreator } from "@/lib/session"
import { cn } from "@/lib/utils"

export const metadata = { title: "My applications · hustl." }

const TABS = {
  active: { label: "Active", statuses: ["APPLIED", "SHORTLISTED"] },
  offers: { label: "Offers", statuses: ["OFFERED"] },
  closed: { label: "Closed", statuses: ["REJECTED", "WITHDRAWN"] },
} as const
type TabKey = keyof typeof TABS

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { creator } = await requireCreator()
  const { tab: rawTab } = await searchParams
  const tab: TabKey = rawTab && rawTab in TABS ? (rawTab as TabKey) : "active"

  const apps = await db.application.findMany({
    where: { creatorId: creator.id },
    include: { brief: { include: { brand: { select: { companyName: true, logoUrl: true } } } } },
    orderBy: { createdAt: "desc" },
  })
  const offered = apps.filter((a) => a.status === "OFFERED")
  const deals = offered.length
    ? await db.deal.findMany({
        where: { creatorId: creator.id, OR: [{ applicationId: { in: offered.map((a) => a.id) } }, { briefId: { in: offered.map((a) => a.briefId) } }] },
        select: { id: true, applicationId: true, briefId: true, status: true },
        orderBy: { createdAt: "desc" },
      })
    : []
  const dealFor = (a: { id: string; briefId: string }) => deals.find((d) => d.applicationId === a.id) ?? deals.find((d) => d.briefId === a.briefId)

  const counts = Object.fromEntries(
    (Object.keys(TABS) as TabKey[]).map((k) => [k, apps.filter((a) => (TABS[k].statuses as readonly string[]).includes(a.status)).length]),
  ) as Record<TabKey, number>
  const list = apps.filter((a) => (TABS[tab].statuses as readonly string[]).includes(a.status))

  const empty = {
    active: { icon: Send, title: "No active applications", description: "Find a brief that fits and send a specific, idea-led pitch. Strong matches are ranked first." },
    offers: { icon: Gift, title: "No offers yet", description: "When a brand picks you, their offer shows up here and in Offers & deals. Shortlisted creators usually hear back first." },
    closed: { icon: Archive, title: "Nothing closed", description: "Applications that weren't selected or that you withdrew will appear here." },
  }[tab]

  return (
    <div>
      <PageHeader
        title="My applications"
        description="Track every pitch you've sent — from applied to shortlisted to offer."
        actions={
          <Button asChild>
            <Link href="/creator/marketplace">
              Find briefs <ArrowRight className="size-4" />
            </Link>
          </Button>
        }
      />

      <nav className="mb-6 inline-flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1" aria-label="Application status">
        {(Object.keys(TABS) as TabKey[]).map((k) => (
          <Link
            key={k}
            href={k === "active" ? "/creator/applications" : `/creator/applications?tab=${k}`}
            aria-current={tab === k ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === k ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {TABS[k].label}
            <span className={cn("rounded-full px-1.5 text-xs tabular-nums", tab === k ? "bg-primary/10 text-primary" : "bg-background/60")}>{counts[k]}</span>
          </Link>
        ))}
      </nav>

      {list.length === 0 ? (
        <EmptyState
          icon={empty.icon}
          title={empty.title}
          description={empty.description}
          action={
            tab !== "closed" ? (
              <Button variant="outline" asChild>
                <Link href="/creator/marketplace">Browse the marketplace</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs">
          {list.map((a) => {
            const deal = a.status === "OFFERED" ? dealFor(a) : undefined
            return (
              <li key={a.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
                <div className="flex min-w-0 flex-1 gap-3">
                  <Avatar name={a.brief.brand.companyName} src={a.brief.brand.logoUrl} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/creator/briefs/${a.briefId}`} className="truncate font-medium hover:text-primary">
                        {a.brief.title}
                      </Link>
                      <StatusBadge status={a.status} />
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {a.brief.brand.companyName} · applied {timeAgo(a.createdAt)} · proposed <span className="font-medium text-foreground">{inr(a.proposedRate)}</span>
                      {a.brief.budgetPerCreator > 0 && <> (budget {inr(a.brief.budgetPerCreator)})</>}
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{a.pitch}</p>
                    {a.status === "SHORTLISTED" && <p className="mt-2 text-xs font-medium text-primary">You&apos;re on the shortlist — watch for an offer.</p>}
                    {a.brief.status !== "PUBLISHED" && ["APPLIED", "SHORTLISTED"].includes(a.status) && (
                      <p className="mt-2 text-xs text-muted-foreground">The brief has closed; the brand may still send offers to applicants.</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                  <ScoreRing score={a.matchScore} size={40} label="match" />
                  <div className="ml-auto flex gap-2 sm:ml-0">
                    {a.status === "OFFERED" ? (
                      <Button size="sm" asChild>
                        <Link href={deal ? `/creator/deals/${deal.id}` : "/creator/deals"}>
                          Open deal <ArrowRight className="size-3.5" />
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/creator/briefs/${a.briefId}`}>View brief</Link>
                      </Button>
                    )}
                    {["APPLIED", "SHORTLISTED"].includes(a.status) && <WithdrawButton applicationId={a.id} briefTitle={a.brief.title} />}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
