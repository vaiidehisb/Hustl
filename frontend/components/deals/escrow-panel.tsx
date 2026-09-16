// Escrow state from GET /payments/deals/:dealId. Server-safe.
import { Lock, ShieldCheck, Snowflake } from "lucide-react"
import type { DealPaymentsResponse, EscrowStatus, LedgerEntryType, PayoutStatus } from "@hustl/contracts"
import { Panel, Pill } from "@/components/app/ui"
import type { Tone } from "@/lib/deals/machine"
import { inr, shortDate, timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"

const ESCROW_LABEL: Record<EscrowStatus, string> = {
  UNFUNDED: "Not funded",
  FUNDING: "Funding…",
  FUNDED: "Funded",
  PARTIALLY_RELEASED: "Partially released",
  RELEASED: "Fully released",
  REFUNDED: "Refunded",
  FROZEN: "Frozen",
}

const ESCROW_TONE: Record<EscrowStatus, Tone> = {
  UNFUNDED: "neutral",
  FUNDING: "warning",
  FUNDED: "brand",
  PARTIALLY_RELEASED: "info",
  RELEASED: "success",
  REFUNDED: "neutral",
  FROZEN: "danger",
}

const LEDGER_LABEL: Record<LedgerEntryType, string> = {
  ESCROW_FUND: "Escrow funded",
  BRAND_FEE: "Platform fee",
  PROCESSING_FEE: "Processing fee",
  RELEASE: "Milestone released",
  CREATOR_FEE: "Creator fee",
  REFUND: "Refund",
}

const PAYOUT_TONE: Record<PayoutStatus, Tone> = { PENDING: "warning", ON_HOLD: "warning", PAID: "success", FAILED: "danger" }

/** Rendered when the payment service is unreachable — the deal itself still shows. */
export function EscrowUnavailable({ message }: { message: string }) {
  return (
    <Panel title="Escrow">
      <p className="rounded-lg bg-warning-soft p-3 text-xs text-warning">{message}</p>
    </Panel>
  )
}

export function EscrowPanel({ payments, party }: { payments: DealPaymentsResponse; party: "BRAND" | "CREATOR" | "ADMIN" }) {
  const { escrow, ledger, payouts } = payments
  return (
    <Panel title="Escrow" action={<Pill tone={ESCROW_TONE[escrow.status] ?? "neutral"}>{ESCROW_LABEL[escrow.status] ?? escrow.status}</Pill>}>
      {escrow.frozen && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-danger-soft p-3 text-xs text-destructive">
          <Snowflake className="mt-0.5 size-4 shrink-0" />
          Releases are frozen while a dispute is open{escrow.frozenAt ? ` (since ${shortDate(escrow.frozenAt)})` : ""}.
        </p>
      )}

      <dl className="space-y-2.5 text-sm">
        <Row k="Funded" v={inr(escrow.fundedAmount)} />
        <Row k="Released" v={inr(escrow.releasedAmount)} />
        {escrow.refundedAmount > 0 && <Row k="Refunded" v={inr(escrow.refundedAmount)} />}
        <Row k="Available in escrow" v={inr(escrow.availableAmount)} strong />
      </dl>

      {party === "BRAND" && (
        <dl className="mt-4 space-y-2 border-t pt-3 text-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Funding breakdown</div>
          <Row k="Escrow" v={inr(escrow.funding.escrow)} muted />
          <Row k="Platform fee" v={inr(escrow.funding.brandFee)} muted />
          <Row k="Processing" v={inr(escrow.funding.processingFee)} muted />
          <Row k="Total charged" v={inr(escrow.funding.total)} />
        </dl>
      )}

      {ledger.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Ledger</div>
          <ul className="mt-2 space-y-1.5 text-sm">
            {ledger.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">
                  {LEDGER_LABEL[e.type] ?? e.type}
                  <span className="ml-1 text-xs text-muted-foreground">{timeAgo(e.createdAt)}</span>
                </span>
                <span className={cn("shrink-0 tabular-nums", e.type === "REFUND" ? "text-muted-foreground" : "")}>{inr(e.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {payouts.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Payouts</div>
          <ul className="mt-2 space-y-2 text-sm">
            {payouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">
                  {p.milestoneTitle ?? "Milestone"}
                  <span className="ml-1 text-xs text-muted-foreground">
                    net {inr(p.net)} · fee {inr(p.fee)}
                  </span>
                  {p.failureReason && <span className="block text-xs text-destructive">{p.failureReason}</span>}
                </span>
                <Pill tone={PAYOUT_TONE[p.status] ?? "neutral"}>{p.status.toLowerCase().replace("_", " ")}</Pill>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 flex items-start gap-2 rounded-lg bg-muted/70 p-3 text-xs text-muted-foreground">
        {escrow.frozen ? <Lock className="mt-0.5 size-4 shrink-0" /> : <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />}
        Funds sit in a segregated escrow account and can't be withdrawn by either party without an approval or a dispute resolution.
      </p>
    </Panel>
  )
}

function Row({ k, v, muted, strong }: { k: string; v: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={cn(muted && "text-muted-foreground")}>{k}</dt>
      <dd className={cn("tabular-nums", strong ? "font-semibold" : muted && "text-muted-foreground")}>{v}</dd>
    </div>
  )
}
