import Link from "next/link"
import { ArrowDownLeft, ArrowUpRight, Landmark, Receipt, ShieldCheck, Wallet } from "lucide-react"
import type { DealPaymentsResponse, DealSummary } from "@hustl/contracts"
import { EmptyState, PageHeader, Panel, StatCard } from "@/components/app/ui"
import { BrandStatusBadge } from "@/components/brand/status"
import { ErrorPanel } from "@/components/brand/error-panel"
import { dealPayments, loadDeals, loadLedger, loadPaymentSummary, soft } from "@/components/brand/data"
import { OUTFLOW_TYPES, TX_LABEL } from "@/components/brand/helpers"
import { inr, shortDate } from "@/lib/format"
import { cn } from "@/lib/utils"

export const metadata = { title: "Payments & escrow · hustl." }

const ESCROW_STATUSES: DealSummary["status"][] = ["FUNDED", "IN_PROGRESS", "COMPLETED", "DISPUTED"]

export default async function BrandPaymentsPage() {
  const [summaryRes, ledgerRes, dealsRes] = await Promise.all([loadPaymentSummary(), loadLedger({ pageSize: 50 }), loadDeals({ pageSize: 50 })])

  const escrowDeals = dealsRes.ok ? dealsRes.data.filter((d) => ESCROW_STATUSES.includes(d.status)).slice(0, 10) : []
  const escrows = await Promise.all(
    escrowDeals.map(async (d) => {
      const payments = await soft<DealPaymentsResponse>(() => dealPayments(d.id))
      return payments ? { deal: d, escrow: payments.escrow } : null
    }),
  )
  const balances = escrows.filter((e): e is { deal: DealSummary; escrow: DealPaymentsResponse["escrow"] } => !!e && e.escrow.fundedAmount > 0)

  return (
    <div className="space-y-8">
      <PageHeader title="Payments & escrow" description="Money you fund sits in escrow and is released to creators only when you approve their work." />

      {summaryRes.ok ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total funded"
            value={inr(summaryRes.data.totalFunded)}
            icon={Landmark}
            hint={`${summaryRes.data.activeEscrows} active escrow${summaryRes.data.activeEscrows === 1 ? "" : "s"}`}
          />
          <StatCard label="Held in escrow" value={inr(summaryRes.data.escrowHeld)} icon={ShieldCheck} hint="Awaiting your approval" />
          <StatCard label="Platform & processing fees" value={inr(summaryRes.data.feesPaid)} icon={Receipt} hint="Charged when you fund" />
          <StatCard label="Refunded to you" value={inr(summaryRes.data.refunded)} icon={ArrowDownLeft} hint="From cancellations and disputes" />
        </div>
      ) : (
        <ErrorPanel error={summaryRes.error} title="Couldn't load your payment summary" />
      )}

      <Panel title="Escrow by deal" description="What's still held on each funded deal" bodyClassName="p-0">
        {!dealsRes.ok ? (
          <div className="p-5">
            <ErrorPanel error={dealsRes.error} compact />
          </div>
        ) : balances.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={Wallet} title="Nothing funded yet" description="Once a contract is signed and you fund escrow, balances per deal show up here." />
          </div>
        ) : (
          <ul className="divide-y">
            {balances.map(({ deal, escrow }) => {
              const settled = escrow.releasedAmount + escrow.refundedAmount
              const pctReleased = escrow.fundedAmount ? Math.round((settled / escrow.fundedAmount) * 100) : 0
              return (
                <li key={deal.id}>
                  <Link href={`/brand/deals/${deal.id}`} className="grid gap-3 px-5 py-4 transition-colors hover:bg-muted/40 sm:grid-cols-[1fr_220px_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{deal.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {deal.creator.name}
                        {escrow.frozen ? " · frozen by a dispute" : ""}
                      </p>
                    </div>
                    <div>
                      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                        <span>{pctReleased}% released</span>
                        <span className="tabular-nums">{inr(escrow.fundedAmount)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full rounded-full", escrow.frozen ? "bg-destructive" : "bg-success")} style={{ width: `${pctReleased}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <BrandStatusBadge status={escrow.status} />
                      <div className="text-right">
                        <div className="text-sm font-semibold tabular-nums">{inr(escrow.availableAmount)}</div>
                        <div className="text-[11px] text-muted-foreground">held</div>
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Transaction ledger" description="Append-only record of every movement of funds" bodyClassName="p-0">
        {!ledgerRes.ok ? (
          <div className="p-5">
            <ErrorPanel error={ledgerRes.error} compact />
          </div>
        ) : ledgerRes.data.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={Receipt} title="No transactions yet" description="Escrow funding, fees, releases and refunds are all recorded here." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Date</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 font-medium">Deal</th>
                  <th className="px-3 py-2.5 font-medium">Reference</th>
                  <th className="px-5 py-2.5 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ledgerRes.data.map((t) => {
                  const out = OUTFLOW_TYPES.includes(t.type)
                  const refund = t.type === "REFUND"
                  return (
                    <tr key={t.id} className="hover:bg-muted/30">
                      <td className="px-5 py-3 whitespace-nowrap text-muted-foreground">{shortDate(t.createdAt)}</td>
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <span
                            className={cn(
                              "grid size-6 place-items-center rounded-full",
                              out ? "bg-muted text-muted-foreground" : refund ? "bg-success-soft text-success" : "bg-accent text-accent-foreground",
                            )}
                          >
                            {refund ? <ArrowDownLeft className="size-3" /> : <ArrowUpRight className="size-3" />}
                          </span>
                          {TX_LABEL[t.type] ?? t.type}
                        </span>
                      </td>
                      <td className="max-w-[260px] px-3 py-3">
                        <Link href={`/brand/deals/${t.dealId}`} className="block truncate hover:underline">
                          {t.dealTitle ?? "View deal"}
                        </Link>
                        <span className="block truncate text-xs text-muted-foreground">{t.provider.toLowerCase()}</span>
                      </td>
                      <td className="px-3 py-3">
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{t.providerRef ?? t.id.slice(0, 8)}</code>
                      </td>
                      <td className={cn("px-5 py-3 text-right font-medium whitespace-nowrap tabular-nums", refund && "text-success")}>
                        {refund ? "+" : out ? "−" : ""}
                        {inr(t.amount)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
