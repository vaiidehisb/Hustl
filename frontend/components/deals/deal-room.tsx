// Deal room — server component fed by GET /deals/:id (+ GET /payments/deals/:id).
// All permissions come from the server's `allowedActions`; nothing is inferred here.
import Link from "next/link"
import { notFound } from "next/navigation"
import { AlertTriangle, ArrowLeft, Check, FileSignature, Lock, ShieldCheck, XCircle } from "lucide-react"
import type { DealDetail, DealPaymentsResponse, PartyName } from "@hustl/contracts"
import { DISPUTE_WINDOW_HOURS, fundingBreakdown, MAX_COUNTER_ROUNDS, payoutBreakdown } from "@hustl/contracts"
import { apiFetch } from "@/lib/api/client"
import { ApiError, isApiError } from "@/lib/api/errors"
import { getSessionUser } from "@/lib/auth/session"
import { inr, shortDate } from "@/lib/format"
import { Avatar, Panel } from "@/components/app/ui"
import { cn } from "@/lib/utils"
import { DealActionBar, DisputeDialog } from "./deal-actions"
import { DealErrorState, type SerializedApiError } from "./deal-error"
import { DealLive } from "./deal-live"
import { ActivityTimeline, MessagesCard, NegotiationHistory } from "./deal-panels"
import { ContractPanel } from "./contract-panel"
import { EscrowPanel, EscrowUnavailable } from "./escrow-panel"
import { FundEscrowDialog } from "./fund-escrow"
import { MilestoneList } from "./milestone-list"
import { DEAL_STAGES, DealStatusBadge, MODE_LABEL, stageIndex } from "./status"

const serialize = (err: unknown): SerializedApiError =>
  isApiError(err) ? { status: err.status, code: err.code, message: err.message } : { status: 500, code: "UNKNOWN", message: "Something went wrong." }

export async function DealRoom({ dealId, viewer }: { dealId: string; viewer: PartyName }) {
  const user = await getSessionUser()
  if (!user) notFound()

  let deal: DealDetail
  try {
    deal = await apiFetch<DealDetail>(`/deals/${encodeURIComponent(dealId)}`)
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) notFound()
    return <DealErrorState error={serialize(err)} title="Couldn't load this deal" />
  }
  // The portal must match the caller's side of the deal.
  if (deal.yourParty !== viewer) notFound()

  const payments = await apiFetch<DealPaymentsResponse>(`/payments/deals/${encodeURIComponent(dealId)}`).catch((err: unknown) => serialize(err))
  const paymentsError = "status" in payments ? (payments as SerializedApiError) : null
  const paymentsData = paymentsError ? null : (payments as DealPaymentsResponse)

  const isBrand = deal.yourParty === "BRAND"
  const base = isBrand ? "/brand/deals" : "/creator/deals"
  const inboxBase = isBrand ? "/brand/messages" : "/creator/messages"
  const other = isBrand ? deal.creator.name : deal.brand.companyName
  const counterpart = isBrand
    ? { name: deal.creator.name, sub: `@${deal.creator.handle}`, href: `/creators/${deal.creator.handle}`, image: deal.creator.avatarUrl }
    : { name: deal.brand.companyName, sub: "", href: `/brands/${deal.brand.slug}`, image: deal.brand.logoUrl }

  const funding = deal.feeRates.brand !== undefined ? fundingBreakdown(deal.amount, deal.feeRates.brand, deal.feeRates.processing) : null
  const payout = deal.feeRates.creator !== undefined ? payoutBreakdown(deal.amount, deal.feeRates.creator) : null
  const index = stageIndex(deal.status)
  const openDispute = paymentsData?.disputes.find((d) => d.status !== "RESOLVED") ?? null
  const myReview = deal.reviews.find((r) => r.authorId === user.id)
  const theirReview = deal.reviews.find((r) => r.authorId !== user.id)
  const disputable = deal.milestones.filter((m) => !["RELEASED", "REFUNDED"].includes(m.status)).map((m) => ({ id: m.id, title: m.title }))

  const next = nextStep({ deal, other, funding, isBrand, openDisputeReason: openDispute?.reason ?? null })

  return (
    <div className="space-y-6">
      <DealLive dealId={deal.id} />

      <Link href={base} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All deals
      </Link>

      <header className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{deal.title}</h1>
            <DealStatusBadge status={deal.status} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <Link href={counterpart.href} className="flex items-center gap-2 font-medium text-foreground hover:underline">
              <Avatar name={counterpart.name} src={counterpart.image} size={26} />
              {counterpart.name}
              {counterpart.sub && <span className="font-normal text-muted-foreground">{counterpart.sub}</span>}
            </Link>
            <span>Started {shortDate(deal.createdAt)}</span>
            {deal.dueDate && <span>Due {shortDate(deal.dueDate)}</span>}
          </div>
        </div>
        <div className="shrink-0 md:text-right">
          <div className="font-display text-3xl font-bold tabular-nums">{inr(deal.amount)}</div>
          <div className="text-sm text-muted-foreground">
            {MODE_LABEL[deal.paymentMode]}
            {payout && <> · you receive {inr(payout.net)}</>}
          </div>
        </div>
      </header>

      {deal.status !== "CANCELLED" && (
        <ol className="grid grid-cols-6 gap-1.5">
          {DEAL_STAGES.map((s, i) => {
            const done = i < index || deal.status === "COMPLETED"
            const current = i === index && deal.status !== "COMPLETED"
            return (
              <li key={s.key} className="min-w-0">
                <div className={cn("h-1.5 rounded-full", done ? "bg-primary" : current ? (deal.status === "DISPUTED" ? "bg-destructive" : "bg-primary/45") : "bg-muted")} />
                <div className={cn("mt-2 truncate text-[11px] font-medium sm:text-xs", done || current ? "text-foreground" : "text-muted-foreground")}>{s.label}</div>
              </li>
            )
          })}
        </ol>
      )}

      <section className={cn("flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:items-center", TONE_CLASS[next.tone])}>
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-full",
            next.tone === "danger" ? "bg-destructive/15 text-destructive" : next.tone === "warning" ? "bg-warning/15 text-warning" : next.tone === "success" ? "bg-success/15 text-success" : "bg-primary/10 text-primary",
          )}
        >
          {next.icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{next.title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{next.body}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {deal.allowedActions.includes("FUND") && <FundEscrowDialog deal={deal} funding={funding} disabled={!!deal.holdUntil && new Date(deal.holdUntil) > new Date()} />}
          <DealActionBar deal={deal} signerName={user.name ?? ""} only={["ACCEPT", "DECLINE", "COUNTER", "SIGN", "REVIEW", "CANCEL"]} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Panel
            title="Milestones & payouts"
            description={isBrand ? "Money only moves when you approve a milestone." : "Each approved milestone is paid out to you, minus the platform fee."}
          >
            {deal.milestones.length ? <MilestoneList deal={deal} /> : <p className="text-sm text-muted-foreground">Milestones appear once the offer is accepted.</p>}
          </Panel>

          <NegotiationHistory deal={deal} />

          <ContractPanel contract={deal.contract} dealId={deal.id} action={<DealActionBar deal={deal} signerName={user.name ?? ""} only={["SIGN"]} />} />

          <MessagesCard deal={deal} inboxBase={inboxBase} />
        </div>

        <aside className="space-y-6">
          {paymentsData ? (
            <EscrowPanel payments={paymentsData} party={deal.yourParty} />
          ) : (
            <EscrowUnavailable
              message={
                paymentsError?.code === "INTEGRATION_UNAVAILABLE"
                  ? `${paymentsError.message} Escrow figures will appear once the payment provider is configured.`
                  : "Escrow details are temporarily unavailable. The deal itself is unaffected — reload in a moment."
              }
            />
          )}

          {theirReview && (
            <Panel title={`${other}'s review`}>
              <div className="text-warning">
                {"★".repeat(theirReview.rating)}
                <span className="text-muted-foreground">{"★".repeat(5 - theirReview.rating)}</span>
              </div>
              {theirReview.comment && <p className="mt-2 text-sm text-muted-foreground">“{theirReview.comment}”</p>}
            </Panel>
          )}
          {myReview && (
            <Panel title="Your review">
              <div className="text-warning">
                {"★".repeat(myReview.rating)}
                <span className="text-muted-foreground">{"★".repeat(5 - myReview.rating)}</span>
              </div>
              {myReview.comment && <p className="mt-2 text-sm text-muted-foreground">“{myReview.comment}”</p>}
            </Panel>
          )}

          <ActivityTimeline deal={deal} currentUserId={user.id} />

          {deal.allowedActions.includes("DISPUTE") && (
            <div className="rounded-xl border border-dashed p-4 text-sm">
              <p className="font-medium">Something wrong?</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Try messaging first. If you can't agree, our trust team reviews evidence from both sides. Disputes freeze pending releases.
              </p>
              <div className="mt-3">
                <DisputeDialog dealId={deal.id} milestones={disputable} windowHours={DISPUTE_WINDOW_HOURS} />
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

const TONE_CLASS = {
  brand: "border-primary/25 bg-accent/60",
  warning: "border-warning/30 bg-warning-soft",
  danger: "border-destructive/30 bg-danger-soft",
  success: "border-success/25 bg-success-soft",
  muted: "bg-card",
} as const

type NextStep = { icon: React.ReactNode; title: string; body: string; tone: keyof typeof TONE_CLASS }

/** The single most important thing this party should do next. */
function nextStep({
  deal,
  other,
  funding,
  isBrand,
  openDisputeReason,
}: {
  deal: DealDetail
  other: string
  funding: { total: number } | null
  isBrand: boolean
  openDisputeReason: string | null
}): NextStep {
  const waiting = deal.awaitingParty && deal.awaitingParty !== deal.yourParty
  const left = deal.counterRoundsRemaining

  switch (deal.status) {
    case "OFFER_SENT":
    case "NEGOTIATING":
      if (waiting) return { icon: <Lock className="size-5" />, title: `Waiting for ${other} to respond`, body: "You'll be notified the moment they accept, counter or decline.", tone: "muted" }
      return {
        icon: <FileSignature className="size-5" />,
        title: deal.status === "NEGOTIATING" ? `${other} sent a counter-offer` : isBrand ? "Respond to the offer" : `${other} wants to work with you`,
        body: `${inr(deal.amount)} · ${MODE_LABEL[deal.paymentMode]}. ${left > 0 ? `${left} of ${MAX_COUNTER_ROUNDS} counter rounds left.` : "No counter rounds left — accept or decline."}`,
        tone: "brand",
      }
    case "AGREED":
    case "CONTRACT_SIGNED": {
      const signed = deal.yourParty === "BRAND" ? deal.contract?.signatures.brand.signedAt : deal.contract?.signatures.creator.signedAt
      if (deal.allowedActions.includes("SIGN") && !signed)
        return { icon: <FileSignature className="size-5" />, title: "Review and sign the contract", body: "Both signatures are required before escrow can be funded.", tone: "brand" }
      if (deal.allowedActions.includes("FUND"))
        return {
          icon: <ShieldCheck className="size-5" />,
          title: "Fund escrow to kick off the work",
          body: funding ? `${inr(funding.total)} total — ${inr(deal.amount)} held safely in escrow until you approve deliverables.` : "Escrow is funded before any work starts.",
          tone: "brand",
        }
      if (!signed) return { icon: <Lock className="size-5" />, title: "Waiting for signatures", body: `${other} still has to sign the contract.`, tone: "muted" }
      return { icon: <Lock className="size-5" />, title: "Contract signed — waiting for escrow", body: isBrand ? "Funding is being set up." : `Don't start work yet. ${other} is funding escrow.`, tone: "muted" }
    }
    case "FUNDED":
    case "IN_PROGRESS": {
      const submitted = deal.milestones.find((m) => m.status === "SUBMITTED")
      const revision = deal.milestones.find((m) => m.status === "REVISION_REQUESTED")
      if (isBrand)
        return submitted
          ? { icon: <AlertTriangle className="size-5" />, title: `Review “${submitted.title}”`, body: `Approve to release ${inr(submitted.amount)}, or request a revision. You have ${DISPUTE_WINDOW_HOURS}h to raise a dispute.`, tone: "warning" }
          : { icon: <ShieldCheck className="size-5" />, title: "Escrow is secured", body: `${other} is working on the deliverables. You review each milestone before any money moves.`, tone: "success" }
      if (revision) return { icon: <AlertTriangle className="size-5" />, title: "Revision requested", body: revision.revisionNote ?? "Update your submission below.", tone: "warning" }
      if (submitted) return { icon: <Lock className="size-5" />, title: "Submitted — awaiting approval", body: `${other} is reviewing “${submitted.title}”. Payment releases on approval.`, tone: "muted" }
      return { icon: <ShieldCheck className="size-5" />, title: "Escrow is funded for you", body: "Deliver the next milestone below to get paid.", tone: "success" }
    }
    case "DISPUTED":
      return {
        icon: <AlertTriangle className="size-5" />,
        title: "Dispute under review",
        body: `${openDisputeReason ?? "A dispute is open."} Releases are frozen until the hustl. trust team resolves it.`,
        tone: "danger",
      }
    case "COMPLETED":
      return deal.allowedActions.includes("REVIEW")
        ? { icon: <Check className="size-5" />, title: "Deal complete — how did it go?", body: `Rate your experience with ${other}.`, tone: "success" }
        : { icon: <Check className="size-5" />, title: "Deal complete", body: "Every milestone is settled and paid out.", tone: "success" }
    default:
      return { icon: <XCircle className="size-5" />, title: "This deal was cancelled", body: "No funds were moved.", tone: "muted" }
  }
}
