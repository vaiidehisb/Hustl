import Link from "next/link"
import { CalendarClock, FileText, Plus, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState, PageHeader, Pill, StatusBadge } from "@/components/app/ui"
import { LinkTabs } from "@/components/brand/link-tabs"
import { cap, PLATFORM_LABEL } from "@/components/brand/helpers"
import { db, json } from "@/lib/db"
import { inr, shortDate, timeAgo } from "@/lib/format"
import { requireBrand } from "@/lib/session"

export const metadata = { title: "Briefs · hustl." }

const TABS = [
  { value: "live", label: "Live", status: "PUBLISHED" },
  { value: "draft", label: "Drafts", status: "DRAFT" },
  { value: "closed", label: "Closed", status: "CLOSED" },
] as const

export default async function BriefsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { brand } = await requireBrand()
  const { tab: rawTab } = await searchParams
  const tab = TABS.find((t) => t.value === rawTab) ?? TABS[0]

  const briefs = await db.brief.findMany({
    where: { brandId: brand.id },
    include: { applications: { select: { status: true } }, _count: { select: { deals: true } } },
    orderBy: { updatedAt: "desc" },
  })
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
          {rows.map((b) => {
            const apps = b.applications.filter((a) => a.status !== "WITHDRAWN")
            const fresh = apps.filter((a) => a.status === "APPLIED").length
            const platforms = json<string[]>(b.platforms, [])
            const deliverables = json<{ type: string; quantity: number }[]>(b.deliverables, [])
            return (
              <Link key={b.id} href={`/brand/briefs/${b.id}`} className="group flex flex-col rounded-xl border bg-card p-5 shadow-xs transition-all hover:border-primary/30 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold group-hover:text-primary">{b.title}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {b.niche ? cap(b.niche) : "Any niche"}
                      {platforms.length > 0 && ` · ${platforms.map((p) => PLATFORM_LABEL[p] ?? p).join(", ")}`}
                    </p>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{b.description}</p>
                {deliverables.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {deliverables.map((d, i) => (
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
                      {apps.length}
                      {fresh > 0 && <span className="rounded-full bg-primary/10 px-1.5 text-[11px] font-medium text-primary">{fresh} new</span>}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground">Deals</div>
                    <div className="font-semibold tabular-nums">
                      {b._count.deals}
                      <span className="font-normal text-muted-foreground"> / {b.creatorsNeeded}</span>
                    </div>
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
            )
          })}
        </div>
      )}
    </div>
  )
}
