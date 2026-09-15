import Link from "next/link"
import { BarChart3, Clock, Handshake, Info, Star, TrendingUp } from "lucide-react"
import { Avatar, EmptyState, PageHeader, Panel, StatCard } from "@/components/app/ui"
import { SpendChart, StatusChart } from "@/components/brand/charts"
import { creatorInclude, SPEND_TYPES } from "@/components/brand/data"
import { monthKey, monthKeys } from "@/components/brand/helpers"
import { db } from "@/lib/db"
import { label } from "@/lib/deals/machine"
import { inr } from "@/lib/format"
import { requireBrand } from "@/lib/session"

export const metadata = { title: "Analytics · hustl." }

const STATUS_ORDER = ["OFFER_SENT", "CONTRACT_PENDING", "CONTRACT_SIGNED", "FUNDED", "IN_PROGRESS", "COMPLETED", "DISPUTED", "CANCELLED"]
const STATUS_COLOR: Record<string, string> = {
  OFFER_SENT: "var(--chart-2)",
  CONTRACT_PENDING: "var(--warning)",
  CONTRACT_SIGNED: "var(--chart-2)",
  FUNDED: "var(--primary)",
  IN_PROGRESS: "var(--primary)",
  COMPLETED: "var(--success)",
  DISPUTED: "var(--destructive)",
  CANCELLED: "var(--muted-foreground)",
}

export default async function BrandAnalyticsPage() {
  const { user, brand } = await requireBrand()
  const [deals, txs, reviews] = await Promise.all([
    db.deal.findMany({
      where: { brandId: brand.id },
      include: { creator: { include: creatorInclude }, milestones: { select: { status: true, dueDate: true, submittedAt: true } } },
    }),
    db.transaction.findMany({ where: { deal: { brandId: brand.id }, status: "SUCCEEDED", type: { in: SPEND_TYPES } }, select: { type: true, amount: true, createdAt: true } }),
    db.review.findMany({ where: { authorId: user.id }, select: { dealId: true, rating: true } }),
  ])

  if (deals.length === 0) {
    return (
      <div>
        <PageHeader title="Analytics" description="Spend, deal velocity and creator performance across your campaigns." />
        <EmptyState icon={BarChart3} title="No data yet" description="Analytics fill in once you've sent your first offer." action={<Link href="/brand/discover" className="text-sm font-medium text-primary hover:underline">Discover creators →</Link>} />
      </div>
    )
  }

  const months = monthKeys(6)
  const spend = months.map((m) => ({ month: m.label, escrow: 0, fees: 0 }))
  for (const t of txs) {
    const i = months.findIndex((m) => m.key === monthKey(t.createdAt))
    if (i < 0) continue
    if (t.type === "ESCROW_FUND") spend[i].escrow += t.amount
    else spend[i].fees += t.amount
  }
  const spend6 = spend.reduce((s, m) => s + m.escrow + m.fees, 0)

  const byStatus = STATUS_ORDER.map((s) => ({ label: label(s), count: deals.filter((d) => d.status === s).length, color: STATUS_COLOR[s] })).filter((s) => s.count > 0)

  const committed = deals.filter((d) => d.status !== "CANCELLED")
  const avgValue = committed.length ? Math.round(committed.reduce((s, d) => s + d.amount, 0) / committed.length) : 0
  const funded = deals.filter((d) => d.fundedAt)
  const avgDaysToFund = funded.length ? funded.reduce((s, d) => s + (d.fundedAt!.getTime() - d.createdAt.getTime()) / 86_400_000, 0) / funded.length : null
  const completed = deals.filter((d) => d.status === "COMPLETED").length
  const closed = deals.filter((d) => ["COMPLETED", "CANCELLED"].includes(d.status)).length
  const ratingByDeal = new Map(reviews.map((r) => [r.dealId, r.rating]))

  type Perf = { id: string; name: string; handle: string; avatar: string | null; deals: number; completed: number; value: number; onTime: number; submitted: number; ratings: number[] }
  const perf = new Map<string, Perf>()
  for (const d of deals) {
    const p =
      perf.get(d.creatorId) ??
      ({ id: d.creatorId, name: d.creator.user.name, handle: d.creator.handle, avatar: d.creator.avatarUrl ?? d.creator.user.image, deals: 0, completed: 0, value: 0, onTime: 0, submitted: 0, ratings: [] } as Perf)
    p.deals++
    if (d.status === "COMPLETED") p.completed++
    if (d.fundedAt) p.value += d.amount
    for (const m of d.milestones) {
      if (!m.submittedAt) continue
      p.submitted++
      if (!m.dueDate || m.submittedAt <= m.dueDate) p.onTime++
    }
    const r = ratingByDeal.get(d.id)
    if (r) p.ratings.push(r)
    perf.set(d.creatorId, p)
  }
  const creators = [...perf.values()].sort((a, b) => b.value - a.value || b.deals - a.deals)

  return (
    <div className="space-y-8">
      <PageHeader title="Analytics" description="Spend, deal velocity and creator performance across your campaigns." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Spend · 6 months" value={inr(spend6)} icon={TrendingUp} hint="Escrow funding + fees" />
        <StatCard label="Avg. deal value" value={inr(avgValue)} icon={Handshake} hint={`${committed.length} non-cancelled deals`} />
        <StatCard
          label="Offer → funded"
          value={avgDaysToFund === null ? "—" : `${avgDaysToFund < 1 ? "<1" : avgDaysToFund.toFixed(1)} days`}
          icon={Clock}
          hint={funded.length ? `Average across ${funded.length} funded deals` : "No funded deals yet"}
        />
        <StatCard label="Completion rate" value={closed ? `${Math.round((completed / closed) * 100)}%` : "—"} icon={Star} hint={`${completed} completed of ${closed} closed`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel title="Spend by month" description="Creator payments vs. fees" className="lg:col-span-3">
          <SpendChart data={spend} height={260} />
        </Panel>
        <Panel title="Deals by status" description={`${deals.length} total`} className="lg:col-span-2">
          <StatusChart data={byStatus} height={Math.max(160, byStatus.length * 36)} />
        </Panel>
      </div>

      <Panel title="Creator performance" description="On-time = milestones submitted on or before their due date" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 font-medium">Creator</th>
                <th className="px-3 py-2.5 text-right font-medium">Deals</th>
                <th className="px-3 py-2.5 text-right font-medium">Completed</th>
                <th className="px-3 py-2.5 text-right font-medium">Funded value</th>
                <th className="px-3 py-2.5 text-right font-medium">On-time</th>
                <th className="px-5 py-2.5 text-right font-medium">Your rating</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {creators.map((c) => {
                const onTime = c.submitted ? Math.round((c.onTime / c.submitted) * 100) : null
                const rating = c.ratings.length ? c.ratings.reduce((s, r) => s + r, 0) / c.ratings.length : null
                return (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <td className="px-5 py-3">
                      <Link href={`/creators/${c.handle}`} className="flex items-center gap-2.5 hover:underline">
                        <Avatar name={c.name} src={c.avatar} size={30} />
                        <span className="truncate font-medium">{c.name}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{c.deals}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{c.completed}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{inr(c.value)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {onTime === null ? <span className="text-muted-foreground">—</span> : <span className={onTime >= 90 ? "text-success" : onTime < 70 ? "text-warning" : ""}>{onTime}%</span>}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {rating === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Star className="size-3.5 fill-warning text-warning" /> {rating.toFixed(1)}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          <span className="font-medium text-foreground">Post-level reach and engagement are coming.</span> Once creators connect their Instagram and YouTube accounts, views, reach and engagement
          for each delivered post will appear here automatically. We don't show estimates in the meantime.
        </p>
      </div>
    </div>
  )
}
