"use client"
// GET /admin/metrics — marketplace health.
import { useQuery } from "@tanstack/react-query"
import { Activity, Scale, ShieldAlert, TrendingUp, Users, Wallet } from "lucide-react"
import type { AdminMetrics, DealStatus } from "@hustl/contracts"
import { ApiErrorState } from "@/components/app/states"
import { Panel, Pill, StatCard } from "@/components/app/ui"
import { Skeleton } from "@/components/ui/skeleton"
import { browserFetch } from "@/lib/api/browser"
import { compact, inr, pct } from "@/lib/format"
import { DEAL_STATUS_LABEL } from "@/components/deals/status"

export function MetricsTab() {
  const query = useQuery({
    queryKey: ["admin", "metrics"],
    queryFn: ({ signal }) => browserFetch<AdminMetrics>("/admin/metrics", { signal }),
  })

  if (query.isPending)
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    )
  if (query.isError) return <ApiErrorState error={query.error} onRetry={() => void query.refetch()} />

  const m = query.data
  const byStatus = Object.entries(m.dealsByStatus ?? {}) as [DealStatus, number][]

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="GMV through escrow" value={inr(m.gmv)} icon={Wallet} />
        <StatCard
          label="Platform revenue"
          value={inr(m.platformRevenue)}
          hint={m.takeRate !== null ? `${pct(m.takeRate)} take rate` : undefined}
          icon={TrendingUp}
        />
        <StatCard label="Active deals" value={compact(m.activeDeals)} icon={Activity} />
        <StatCard label="Users" value={compact(m.users.total)} hint={`${m.users.byRole.BRAND} brands · ${m.users.byRole.CREATOR} creators · ${m.users.suspended} suspended`} icon={Users} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Revenue split">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Brand fees</dt>
              <dd className="tabular-nums">{inr(m.revenueBreakdown.brandFees)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Creator fees</dt>
              <dd className="tabular-nums">{inr(m.revenueBreakdown.creatorFees)}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
            <Pill tone={m.openDisputes ? "danger" : "neutral"}>
              <Scale className="size-3.5" /> {m.openDisputes} open dispute{m.openDisputes === 1 ? "" : "s"}
            </Pill>
            <Pill tone={m.openFraudFlags ? "warning" : "neutral"}>
              <ShieldAlert className="size-3.5" /> {m.openFraudFlags} open fraud flag{m.openFraudFlags === 1 ? "" : "s"}
            </Pill>
          </div>
        </Panel>

        <Panel title="Deals by status">
          {byStatus.length === 0 ? (
            <p className="text-sm text-muted-foreground">No deals yet.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {byStatus
                .filter(([, count]) => count > 0)
                .map(([status, count]) => (
                  <li key={status} className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{DEAL_STATUS_LABEL[status] ?? status}</span>
                    <span className="tabular-nums">{count}</span>
                  </li>
                ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
