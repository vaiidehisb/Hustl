import Link from "next/link"
import { Archive, ArrowRight, Clock3, Gift, Send } from "lucide-react"
import type { ApplicationStatus } from "@hustl/contracts"
import { Button } from "@/components/ui/button"
import { Avatar, EmptyState, PageHeader, ScoreRing, StatusBadge } from "@/components/app/ui"
import { WithdrawButton } from "@/components/creator/withdraw-button"
import { ErrorState } from "@/components/creator/states"
import { APPLICATION_TABS, canWithdraw, type ApplicationTab } from "@/components/creator/lib"
import { inr, timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"
import { getMyApplications, load } from "../data"

export const metadata = { title: "My applications" }

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: rawTab } = await searchParams
  const tab: ApplicationTab = rawTab && rawTab in APPLICATION_TABS ? (rawTab as ApplicationTab) : "active"

  const result = await load(() => getMyApplications({ pageSize: 100 }))

  const header = (
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
  )

  if (!result.ok) {
    return (
      <div>
        {header}
        <ErrorState error={result.error} />
      </div>
    )
  }

  const apps = result.data.items
  const counts = Object.fromEntries(
    (Object.keys(APPLICATION_TABS) as ApplicationTab[]).map((k) => [k, apps.filter((a) => (APPLICATION_TABS[k].statuses as readonly ApplicationStatus[]).includes(a.status)).length]),
  ) as Record<ApplicationTab, number>
  const list = apps.filter((a) => (APPLICATION_TABS[tab].statuses as readonly ApplicationStatus[]).includes(a.status))

  const empty = {
    active: { icon: Send, title: "No active applications", description: "Find a brief that fits and send a specific, idea-led pitch." },
    offers: { icon: Gift, title: "No offers yet", description: "When a brand picks you, their offer shows up here and in Offers & deals." },
    closed: { icon: Archive, title: "Nothing closed", description: "Applications that weren't selected or that you withdrew appear here." },
  }[tab]

  return (
    <div>
      {header}

      <nav className="mb-6 inline-flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1" aria-label="Application status">
        {(Object.keys(APPLICATION_TABS) as ApplicationTab[]).map((k) => (
          <Link
            key={k}
            href={k === "active" ? "/creator/applications" : `/creator/applications?tab=${k}`}
            aria-current={tab === k ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === k ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {APPLICATION_TABS[k].label}
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
          {list.map((a) => (
            <li key={a.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
              <div className="flex min-w-0 flex-1 gap-3">
                <Avatar name={a.brief?.brand.companyName ?? "Brand"} src={a.brief?.brand.logoUrl} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/creator/briefs/${a.briefId}`} className="truncate font-medium hover:text-primary">
                      {a.brief?.title ?? "Brief"}
                    </Link>
                    <StatusBadge status={a.status} />
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {a.brief?.brand.companyName} · applied {timeAgo(a.createdAt)} · proposed <span className="font-medium text-foreground">{inr(a.proposedRate)}</span>
                    {a.brief?.budgetPerCreator ? <> (budget {inr(a.brief.budgetPerCreator)})</> : null}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{a.pitch}</p>
                  {a.status === "SHORTLISTED" && <p className="mt-2 text-xs font-medium text-primary">You&apos;re on the shortlist — watch for an offer.</p>}
                  {a.brief && a.brief.status !== "PUBLISHED" && (a.status === "APPLIED" || a.status === "SHORTLISTED") && (
                    <p className="mt-2 text-xs text-muted-foreground">The brief has closed; the brand may still send offers to applicants.</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                {a.matchScore !== null ? (
                  <ScoreRing score={a.matchScore} size={40} label="fit" />
                ) : (
                  <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-muted-foreground">
                    <Clock3 className="size-3" /> fit score queued
                  </span>
                )}
                <div className="ml-auto flex gap-2 sm:ml-0">
                  {a.status === "OFFERED" ? (
                    <Button size="sm" asChild>
                      <Link href={a.dealId ? `/creator/deals/${a.dealId}` : "/creator/deals"}>
                        Open deal <ArrowRight className="size-3.5" />
                      </Link>
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/creator/briefs/${a.briefId}`}>View brief</Link>
                    </Button>
                  )}
                  {canWithdraw(a.status) && <WithdrawButton applicationId={a.id} briefTitle={a.brief?.title ?? "this brief"} />}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
