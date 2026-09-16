import Link from "next/link"
import { BarChart3, Clock, FileText, Handshake, Info, TrendingUp } from "lucide-react"
import { EmptyState, PageHeader, Panel, StatCard } from "@/components/app/ui"
import { SpendChart, StatusChart } from "@/components/brand/charts"
import { BrandStatusBadge } from "@/components/brand/status"
import { ErrorPanel } from "@/components/brand/error-panel"
import { loadCampaigns, loadOverview } from "@/components/brand/data"
import { monthLabel, statusLabel } from "@/components/brand/helpers"
import { inr, shortDate } from "@/lib/format"

export const metadata = { title: "Analytics · hustl." }

const STATUS_COLOR: Record<string, string> = {
  OFFER_SENT: "var(--chart-2)",
  NEGOTIATING: "var(--warning)",
  AGREED: "var(--warning)",
  CONTRACT_SIGNED: "var(--chart-2)",
  FUNDED: "var(--primary)",
  IN_PROGRESS: "var(--primary)",
  COMPLETED: "var(--success)",
  DISPUTED: "var(--destructive)",
  CANCELLED: "var(--muted-foreground)",
}

export default async function BrandAnalyticsPage() {
  const [overviewRes, campaignsRes] = await Promise.all([loadOverview(), loadCampaigns()])

  if (!overviewRes.ok) {
    return (
      <div>
        <PageHeader title="Analytics" description="Spend, deal velocity and campaign performance across your briefs." />
        <ErrorPanel error={overviewRes.error} title="Couldn't load analytics" />
      </div>
    )
  }

  const o = overviewRes.data
  const spend = o.monthlySpend.map((m) => ({ month: monthLabel(m.month), amount: m.amount }))
  const byStatus = Object.entries(o.dealsByStatus)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({ label: statusLabel(status), count, color: STATUS_COLOR[status] ?? "var(--muted-foreground)" }))
  const campaigns = campaignsRes.ok ? campaignsRes.data : []

  if (o.totalDeals === 0 && campaigns.length === 0) {
    return (
      <div>
        <PageHeader title="Analytics" description="Spend, deal velocity and campaign performance across your briefs." />
        <EmptyState
          icon={BarChart3}
          title="No data yet"
          description="Analytics fill in once you've published a brief or sent your first offer."
          action={
            <Link href="/brand/discover" className="text-sm font-medium text-primary hover:underline">
              Discover creators →
            </Link>
          }
        />
      </div>
    )
  }

  const avgDaysToFund = o.avgHoursToFund === null ? null : o.avgHoursToFund / 24

  return (
    <div className="space-y-8">
      <PageHeader title="Analytics" description="Spend, deal velocity and campaign performance across your briefs." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total spend" value={inr(o.totalSpend)} icon={TrendingUp} hint={`Escrow ${inr(o.spendBreakdown.escrowFunded)} + fees ${inr(o.spendBreakdown.brandFees + o.spendBreakdown.processingFees)}`} />
        <StatCard label="Deals" value={o.totalDeals} icon={Handshake} hint={`${o.dealsByStatus.COMPLETED} completed`} />
        <StatCard
          label="Offer → funded"
          value={avgDaysToFund === null ? "—" : `${avgDaysToFund < 1 ? "<1" : avgDaysToFund.toFixed(1)} days`}
          icon={Clock}
          hint={avgDaysToFund === null ? "No funded deals yet" : "Average across funded deals"}
        />
        <StatCard label="Live briefs" value={o.activeBriefs} icon={FileText} hint={`${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"} tracked`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel title="Spend by month" description="Escrow funding + fees, last 12 months" className="lg:col-span-3">
          <SpendChart data={spend} height={260} />
        </Panel>
        <Panel title="Deals by status" description={`${o.totalDeals} total`} className="lg:col-span-2">
          {byStatus.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No deals yet.</p>
          ) : (
            <StatusChart data={byStatus} height={Math.max(160, byStatus.length * 36)} />
          )}
        </Panel>
      </div>

      <Panel title="Campaign performance" description="Per brief: applications, shortlists, deals and spend" bodyClassName="p-0">
        {!campaignsRes.ok ? (
          <div className="p-5">
            <ErrorPanel error={campaignsRes.error} compact />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={FileText} title="No campaigns yet" description="Publish a brief and its funnel shows up here." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Brief</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 text-right font-medium">Applications</th>
                  <th className="px-3 py-2.5 text-right font-medium">Shortlisted</th>
                  <th className="px-3 py-2.5 text-right font-medium">Deals</th>
                  <th className="px-3 py-2.5 text-right font-medium">Avg. match</th>
                  <th className="px-5 py-2.5 text-right font-medium">Spend</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {campaigns.map((c) => (
                  <tr key={c.briefId} className="hover:bg-muted/30">
                    <td className="max-w-[280px] px-5 py-3">
                      <Link href={`/brand/briefs/${c.briefId}`} className="block truncate font-medium hover:underline">
                        {c.title}
                      </Link>
                      <span className="block truncate text-xs text-muted-foreground">{c.publishedAt ? `Published ${shortDate(c.publishedAt)}` : "Not published"}</span>
                    </td>
                    <td className="px-3 py-3">
                      <BrandStatusBadge status={c.status} />
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{c.applications}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{c.shortlisted}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {c.deals}
                      <span className="text-muted-foreground"> / {c.offers} offered</span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{c.avgMatchScore === null ? <span className="text-muted-foreground">—</span> : Math.round(c.avgMatchScore)}</td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums">{inr(c.spend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          <span className="font-medium text-foreground">Post-level reach and engagement are coming.</span> Once creators connect their Instagram and YouTube accounts, views, reach and engagement for
          each delivered post appear here automatically. We don't show estimates in the meantime.
        </p>
      </div>
    </div>
  )
}
