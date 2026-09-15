import Link from "next/link"
import { Building2, Clock, FlaskConical, Hourglass, Lock, Percent, ReceiptText, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState, PageHeader, Panel, Pill, StatCard, StatusBadge, TextLink } from "@/components/app/ui"
import { EarningsChart } from "@/components/creator/charts"
import { dueLabel, lastMonths, monthKey } from "@/components/creator/lib"
import { CREATOR_FEE, payoutBreakdown } from "@/lib/payments/fees"
import { db } from "@/lib/db"
import { inr, shortDate } from "@/lib/format"
import { requireCreator } from "@/lib/session"

export const metadata = { title: "Earnings · hustl." }

type LedgerRow = {
  key: string
  date: Date
  dealId: string
  dealTitle: string
  brand: string
  milestone: string
  gross: number
  fee: number
  net: number
  reference: string
  status: string
}

export default async function EarningsPage() {
  const { creator } = await requireCreator()

  const [txns, fundedDeals] = await Promise.all([
    db.transaction.findMany({
      where: { type: { in: ["RELEASE", "CREATOR_FEE"] }, deal: { creatorId: creator.id } },
      include: { deal: { select: { id: true, title: true, brand: { select: { companyName: true } } } }, milestone: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.deal.findMany({
      where: { creatorId: creator.id, status: { in: ["FUNDED", "IN_PROGRESS"] } },
      include: { brand: { select: { companyName: true } }, milestones: { orderBy: { order: "asc" } } },
    }),
  ])

  // One ledger row per payout: RELEASE (net) + CREATOR_FEE share a milestone.
  const rows = new Map<string, LedgerRow>()
  for (const t of txns) {
    const key = t.milestoneId ?? `${t.dealId}-${t.createdAt.toISOString().slice(0, 16)}`
    const row =
      rows.get(key) ??
      ({
        key,
        date: t.createdAt,
        dealId: t.deal.id,
        dealTitle: t.deal.title,
        brand: t.deal.brand.companyName,
        milestone: t.milestone?.title ?? "Payout",
        gross: 0,
        fee: 0,
        net: 0,
        reference: "",
        status: t.status,
      } satisfies LedgerRow)
    if (t.type === "RELEASE") {
      row.net += t.amount
      row.reference = t.reference
      row.status = t.status
      row.date = t.createdAt
    } else row.fee += t.amount
    row.gross = row.net + row.fee
    rows.set(key, row)
  }
  const ledger = [...rows.values()].sort((a, b) => b.date.getTime() - a.date.getTime())

  const netPaid = txns.filter((t) => t.type === "RELEASE").reduce((s, t) => s + t.amount, 0)
  const fees = txns.filter((t) => t.type === "CREATOR_FEE").reduce((s, t) => s + t.amount, 0)

  const upcoming = fundedDeals
    .flatMap((d) =>
      d.milestones
        .filter((m) => m.status !== "RELEASED" && m.status !== "REFUNDED")
        .map((m) => ({ ...m, deal: d, payout: payoutBreakdown(m.amount, d.creatorFeePct) })),
    )
    .sort((a, b) => {
      const rank = (s: string) => (s === "APPROVED" ? 0 : s === "SUBMITTED" ? 1 : 2)
      return rank(a.status) - rank(b.status) || (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity)
    })
  const inEscrow = upcoming.reduce((s, m) => s + m.amount, 0)
  const awaitingApproval = upcoming.filter((m) => m.status === "SUBMITTED")
  const awaitingSum = awaitingApproval.reduce((s, m) => s + m.amount, 0)

  const chart = lastMonths(6).map((m) => ({
    label: m.label,
    net: txns.filter((t) => t.type === "RELEASE" && monthKey(t.createdAt) === m.key).reduce((s, t) => s + t.amount, 0),
    fee: txns.filter((t) => t.type === "CREATOR_FEE" && monthKey(t.createdAt) === m.key).reduce((s, t) => s + t.amount, 0),
  }))

  const example = payoutBreakdown(20_000)

  return (
    <div>
      <PageHeader title="Earnings" description="Every rupee from escrow to your account — what's paid, what's secured, and what's next." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Net paid out" value={inr(netPaid)} icon={Wallet} hint={`${ledger.length} payout${ledger.length === 1 ? "" : "s"} to date`} />
        <StatCard label="Platform fees" value={inr(fees)} icon={Percent} hint={`${Math.round(CREATOR_FEE * 100)}% of each released milestone`} />
        <StatCard label="In escrow" value={inr(inEscrow)} icon={Lock} hint="Funded by brands, released on approval" />
        <StatCard
          label="Awaiting approval"
          value={inr(awaitingSum)}
          icon={Hourglass}
          hint={awaitingApproval.length ? `${awaitingApproval.length} submitted deliverable${awaitingApproval.length === 1 ? "" : "s"}` : "Nothing waiting on brands"}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title="Monthly payouts" description="Net paid to you, with platform fees stacked on top." className="min-w-0 lg:col-span-2">
          {netPaid === 0 ? (
            <div className="py-10 text-center">
              <p className="font-medium">No payouts yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {inEscrow ? `${inr(inEscrow)} is already secured in escrow for you — submit deliverables to get it released.` : "Once a brand approves your first milestone, the payout lands here."}
              </p>
            </div>
          ) : (
            <EarningsChart data={chart} showFees />
          )}
        </Panel>

        <Panel title="Upcoming payouts" description="Secured in escrow on your live deals." bodyClassName="p-0" className="min-w-0">
          {upcoming.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nothing in escrow right now.</p>
          ) : (
            <ul className="max-h-[320px] divide-y overflow-y-auto">
              {upcoming.map((m) => {
                const due = dueLabel(m.dueDate)
                return (
                  <li key={m.id}>
                    <Link href={`/creator/deals/${m.deal.id}`} className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-muted/50">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{m.title}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {m.deal.brand.companyName} · {m.deal.title}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={m.status} />
                          {m.status === "PENDING" && due && <Pill tone={due.tone}>{due.text}</Pill>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold tabular-nums">{inr(m.payout.net)}</div>
                        <div className="text-[11px] text-muted-foreground">of {inr(m.amount)}</div>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Payout ledger" description="Each row is one milestone released from escrow." className="mt-6" bodyClassName="p-0">
        {ledger.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={ReceiptText}
              title="Your ledger is empty"
              description="Payouts, fees and references will be recorded here for your taxes and records."
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
                  <TableHead className="text-right">Net paid</TableHead>
                  <TableHead className="pr-5">Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="whitespace-nowrap pl-5 text-muted-foreground">{shortDate(r.date)}</TableCell>
                    <TableCell className="min-w-[220px]">
                      <Link href={`/creator/deals/${r.dealId}`} className="font-medium hover:text-primary">
                        {r.dealTitle}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {r.brand} · {r.milestone}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{inr(r.gross)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">−{inr(r.fee)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{inr(r.net)}</TableCell>
                    <TableCell className="pr-5">
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{r.reference || "—"}</code>
                        {r.status !== "SUCCEEDED" && <Pill tone={r.status === "FAILED" ? "danger" : "warning"}>{r.status.toLowerCase()}</Pill>}
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
        <Panel
          title="Payout method"
          action={
            <Pill tone="warning">
              <FlaskConical className="size-3" /> Test mode
            </Pill>
          }
        >
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <Building2 className="size-5" />
            </span>
            <div>
              <div className="font-medium">Bank account or UPI</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Payouts are simulated in test mode. Adding a bank account or UPI ID unlocks once KYC and live payouts via Razorpay Route are enabled for your
                account.
              </p>
            </div>
          </div>
          <Button variant="outline" className="mt-4" disabled>
            Add payout method
          </Button>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" /> Live payouts typically settle T+1 to T+2 business days after release.
          </p>
        </Panel>

        <Panel title="How fees work">
          <p className="text-sm text-muted-foreground">
            hustl. takes a flat {Math.round(CREATOR_FEE * 100)}% from each milestone when it&apos;s released. Brand fees and payment processing are paid by the brand
            — never deducted from you.
          </p>
          <dl className="mt-4 space-y-2 rounded-lg border bg-muted/30 p-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Milestone approved</dt>
              <dd className="tabular-nums">{inr(example.gross)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Platform fee ({Math.round(CREATOR_FEE * 100)}%)</dt>
              <dd className="tabular-nums">−{inr(example.fee)}</dd>
            </div>
            <div className="flex justify-between border-t pt-2 font-semibold">
              <dt>You receive</dt>
              <dd className="tabular-nums text-success">{inr(example.net)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Disputed milestones are frozen until resolved. <TextLink href="/creator/deals">See your deals</TextLink>
          </p>
        </Panel>
      </div>
    </div>
  )
}
