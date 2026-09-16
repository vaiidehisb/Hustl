import Link from "next/link"
import { Hourglass, Lock, Percent, ReceiptText, Wallet } from "lucide-react"
import { CREATOR_FEE_RATE, payoutBreakdown } from "@hustl/contracts"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState, PageHeader, Panel, Pill, StatCard, TextLink } from "@/components/app/ui"
import { EarningsChart } from "@/components/creator/charts"
import { ErrorState } from "@/components/creator/states"
import { PayoutAccountPanel } from "@/components/creator/payout-account"
import { monthLabel } from "@/components/creator/lib"
import { inr, shortDate } from "@/lib/format"
import { getCreatorOverview, getPaymentSummary, getPayoutAccount, getPayouts, load } from "../data"

export const metadata = { title: "Earnings · hustl." }

const PAYOUT_TONE = { PAID: "success", PENDING: "warning", ON_HOLD: "warning", FAILED: "danger" } as const
const PAYOUT_LABEL = { PAID: "Paid", PENDING: "Pending", ON_HOLD: "On hold", FAILED: "Failed" } as const

export default async function EarningsPage() {
  const [summaryResult, payoutsResult, overviewResult, accountResult] = await Promise.all([
    load(getPaymentSummary),
    load(() => getPayouts({ pageSize: 50 })),
    load(getCreatorOverview),
    load(getPayoutAccount),
  ])

  const summary = summaryResult.ok ? summaryResult.data : null
  const overview = overviewResult.ok ? overviewResult.data : null
  const payouts = payoutsResult.ok ? payoutsResult.data.items : []
  const chart = (overview?.monthlyEarnings ?? []).slice(-6).map((m) => ({ label: monthLabel(m.month), net: m.amount }))
  const example = payoutBreakdown(20_000)

  return (
    <div>
      <PageHeader title="Earnings" description="Every rupee from escrow to your account — what's paid, what's secured, and what's next." />

      {summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Net paid out" value={inr(summary.paidOut)} icon={Wallet} hint={`${payouts.length} payout${payouts.length === 1 ? "" : "s"} on record`} />
          <StatCard label="Platform fees" value={inr(summary.feesPaid)} icon={Percent} hint={`${Math.round(CREATOR_FEE_RATE * 100)}% of each released milestone`} />
          <StatCard label="In escrow" value={inr(summary.inEscrow)} icon={Lock} hint="Funded by brands, released on approval" />
          <StatCard
            label="Pending payouts"
            value={inr(summary.pendingPayouts)}
            icon={Hourglass}
            hint={summary.onHoldPayouts ? `${inr(summary.onHoldPayouts)} on hold` : "Nothing on hold"}
          />
        </div>
      ) : (
        !summaryResult.ok && <ErrorState error={summaryResult.error} />
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title="Monthly payouts" description="Net paid to you, by the month the payout settled." className="min-w-0 lg:col-span-2">
          {!overview ? (
            !overviewResult.ok ? (
              <ErrorState error={overviewResult.error} compact />
            ) : null
          ) : overview.totalEarned === 0 ? (
            <div className="py-10 text-center">
              <p className="font-medium">No payouts yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {overview.pending.inEscrow
                  ? `${inr(overview.pending.inEscrow)} is already secured in escrow for you — submit deliverables to get it released.`
                  : "Once a brand approves your first milestone, the payout lands here."}
              </p>
            </div>
          ) : (
            <EarningsChart data={chart} />
          )}
        </Panel>

        <Panel title="What's still coming" description="Straight from your deal and escrow records." className="min-w-0">
          {overview ? (
            <dl className="space-y-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">In escrow (gross)</dt>
                <dd className="font-semibold tabular-nums">{inr(overview.pending.inEscrow)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Approved, awaiting release</dt>
                <dd className="font-semibold tabular-nums">{inr(overview.pending.approvedAwaitingRelease)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Payouts in flight (net)</dt>
                <dd className="font-semibold tabular-nums">{inr(overview.pending.payoutsPending)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t pt-3">
                <dt className="font-medium">Total pending</dt>
                <dd className="font-display font-bold tabular-nums">{inr(overview.pending.total)}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Pending amounts couldn&apos;t be loaded just now.</p>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Escrow is funded before you start. <TextLink href="/creator/deals">See your deals</TextLink>
          </p>
        </Panel>
      </div>

      <Panel title="Payout ledger" description="Each row is one milestone released from escrow." className="mt-6" bodyClassName="p-0">
        {!payoutsResult.ok ? (
          <div className="p-5">
            <ErrorState error={payoutsResult.error} compact />
          </div>
        ) : payouts.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={ReceiptText}
              title="Your ledger is empty"
              description="Payouts, fees and provider references are recorded here for your taxes and records."
              action={
                <Button variant="outline" asChild>
                  <Link href="/creator/deals">View my deals</Link>
                </Button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Date</TableHead>
                  <TableHead>Deal · milestone</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="pr-5">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap pl-5 text-muted-foreground">{shortDate(p.paidAt ?? p.createdAt)}</TableCell>
                    <TableCell className="min-w-[220px]">
                      <Link href={`/creator/deals/${p.dealId}`} className="font-medium hover:text-primary">
                        {p.dealTitle ?? "Deal"}
                      </Link>
                      <div className="text-xs text-muted-foreground">{p.milestoneTitle ?? "Milestone"}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{inr(p.gross)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">−{inr(p.fee)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{inr(p.net)}</TableCell>
                    <TableCell className="pr-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone={PAYOUT_TONE[p.status]}>{PAYOUT_LABEL[p.status]}</Pill>
                        {p.failureReason && <Pill tone="danger">{p.failureReason}</Pill>}
                        {p.providerRef && <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{p.providerRef}</code>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <PayoutAccountPanel account={accountResult.ok ? accountResult.data : null} error={accountResult.ok ? undefined : accountResult.error} />

        <Panel title="How fees work">
          <p className="text-sm text-muted-foreground">
            hustl. takes a flat {Math.round(CREATOR_FEE_RATE * 100)}% from each milestone when it&apos;s released. Brand fees and payment processing are paid by the brand — never
            deducted from you.
          </p>
          <dl className="mt-4 space-y-2 rounded-lg border bg-muted/30 p-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Milestone approved</dt>
              <dd className="tabular-nums">{inr(example.gross)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Platform fee ({Math.round(CREATOR_FEE_RATE * 100)}%)</dt>
              <dd className="tabular-nums">−{inr(example.fee)}</dd>
            </div>
            <div className="flex justify-between border-t pt-2 font-semibold">
              <dt>You receive</dt>
              <dd className="tabular-nums text-success">{inr(example.net)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">Disputed milestones are frozen until a resolution is recorded.</p>
        </Panel>
      </div>
    </div>
  )
}
