import Link from "next/link"
import { CalendarClock, FileText, Plus, Users } from "lucide-react"
import type { BriefStatus } from "@hustl/contracts"
import { Button } from "@/components/ui/button"
import { EmptyState, PageHeader, Pill } from "@/components/app/ui"
import { LinkTabs } from "@/components/brand/link-tabs"
import { BrandStatusBadge } from "@/components/brand/status"
import { ErrorPanel } from "@/components/brand/error-panel"
import { loadBriefs } from "@/components/brand/data"
import { cap, platformLabel } from "@/components/brand/helpers"
import { inr, shortDate, timeAgo } from "@/lib/format"

export const metadata = { title: "Briefs" }

const TABS = [
  { value: "live", label: "Live", status: "PUBLISHED" satisfies BriefStatus },
  { value: "draft", label: "Drafts", status: "DRAFT" satisfies BriefStatus },
  { value: "closed", label: "Closed", status: "CLOSED" satisfies BriefStatus },
] as const

export default async function BriefsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: rawTab } = await searchParams
  const tab = TABS.find((t) => t.value === rawTab) ?? TABS[0]
  const res = await loadBriefs({ pageSize: 100 })

  if (!res.ok) {
    return (
      <div>
        <PageHeader title="Briefs" description="Post a campaign once, get applications from matched creators, and turn the best into escrow-backed deals." />
        <ErrorPanel error={res.error} title="Couldn't load your briefs" />
      </div>
    )
  }

  const briefs = res.data
  const rows = briefs.filter((b) => b.status === tab.status)

  return (
    <div>
      <PageHeader
        title="Briefs"
        description="Post a campaign once, get applications from matched creators, and turn the best into escrow-backed deals."
        actions={
          <Button asChild>
            <Link href="/brand/briefs/new">
              <Plus /> Post a brief
            </Link>
          </Button>
        }
      />

      <LinkTabs
        className="mb-6"
        active={tab.value}
        tabs={TABS.map((t) => ({ value: t.value, label: t.label, count: briefs.filter((b) => b.status === t.status).length, href: `/brand/briefs?tab=${t.value}` }))}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={tab.value === "live" ? "No live briefs" : tab.value === "draft" ? "No drafts" : "No closed briefs"}
          description={
            tab.value === "live"
              ? "Describe your campaign in plain words — AI turns it into a structured brief and ranks creators who fit."
              : tab.value === "draft"
                ? "Briefs you save without publishing land here."
                : "Briefs you close stop accepting applications and move here."
          }
          action={
            tab.value !== "closed" && (
              <Button asChild>
                <Link href="/brand/briefs/new">
                  <Plus /> Post a brief
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((b) => (
            <Link
              key={b.id}
              href={`/brand/briefs/${b.id}`}
              className="group flex flex-col rounded-xl border bg-card p-5 shadow-xs transition-all hover:border-primary/30 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold group-hover:text-primary">{b.title}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {b.niche ? cap(b.niche) : "Any niche"}
                    {b.platforms.length > 0 && ` · ${b.platforms.map(platformLabel).join(", ")}`}
                  </p>
                </div>
                <BrandStatusBadge status={b.status} />
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{b.description}</p>
              {b.deliverables.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {b.deliverables.map((d, i) => (
                    <Pill key={i}>
                      {d.quantity} × {d.type}
                    </Pill>
                  ))}
                </div>
              )}
              <div className="min-h-4 flex-1" />
              <div className="grid grid-cols-3 gap-2 border-t pt-4 text-sm">
                <div>
                  <div className="text-[11px] text-muted-foreground">Applicants</div>
                  <div className="flex items-center gap-1.5 font-semibold tabular-nums">
                    <Users className="size-3.5 text-muted-foreground" />
                    {b.applicationsCount ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Creators needed</div>
                  <div className="font-semibold tabular-nums">{b.creatorsNeeded}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Per creator</div>
                  <div className="font-semibold tabular-nums">{b.budgetPerCreator ? inr(b.budgetPerCreator) : "—"}</div>
                </div>
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarClock className="size-3.5" />
                {b.deadline ? `Deadline ${shortDate(b.deadline)}` : `Updated ${timeAgo(b.updatedAt)}`}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
