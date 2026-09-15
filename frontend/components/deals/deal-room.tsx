import Link from "next/link"
import { notFound } from "next/navigation"
import { AlertTriangle, ArrowLeft, Check, FileSignature, Lock, ShieldCheck, XCircle } from "lucide-react"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { partyFor } from "@/lib/deals/service"
import { DEAL_STAGES, DISPUTE_WINDOW_HOURS, MAX_NEGOTIATION_ROUNDS, label, type Party } from "@/lib/deals/machine"
import { fundingBreakdown, payoutBreakdown } from "@/lib/payments/fees"
import { inr, shortDate, timeAgo } from "@/lib/format"
import { Avatar, Panel, StatusBadge } from "@/components/app/ui"
import { cn } from "@/lib/utils"
import { CancelDeal, DisputeDialog, FundEscrow, OfferActions, ReviewForm, SignContract } from "./deal-actions"
import { MilestoneList } from "./milestone-list"
import { DealChat } from "./deal-chat"

const MODE_LABEL: Record<string, string> = {
  COMPLETION: "Full on completion",
  UPFRONT: "Full upfront release",
  MILESTONES: "Custom milestones",
}

export async function DealRoom({ dealId, viewer }: { dealId: string; viewer: "BRAND" | "CREATOR" }) {
  const user = await getCurrentUser()
  if (!user) notFound()
  const deal = await db.deal.findUnique({
    where: { id: dealId },
    include: {
      brand: { include: { user: { select: { id: true, name: true, kycVerified: true } } } },
      creator: { include: { user: { select: { id: true, name: true, image: true } } } },
      brief: { select: { id: true, title: true } },
      milestones: { orderBy: { order: "asc" } },
      events: { orderBy: { createdAt: "desc" }, include: { actor: { select: { name: true } } } },
      messages: { orderBy: { createdAt: "asc" }, include: { sender: { select: { id: true, name: true, image: true } } } },
      transactions: true,
      disputes: { orderBy: { createdAt: "desc" } },
      reviews: true,
    },
  })
  if (!deal) notFound()
  let party: Party
  try {
    party = partyFor(deal, user)
  } catch {
    notFound()
  }
  if (party !== viewer) notFound()

  const isBrand = party === "BRAND"
  const counterpart = isBrand
    ? { name: deal.creator.user.name, sub: `@${deal.creator.handle}`, href: `/creators/${deal.creator.handle}`, image: deal.creator.avatarUrl ?? deal.creator.user.image }
    : { name: deal.brand.companyName, sub: deal.brand.industry, href: `/brands/${deal.brand.slug}`, image: deal.brand.logoUrl }
  const sum = (...types: string[]) => deal.transactions.filter((t) => types.includes(t.type)).reduce((s, t) => s + t.amount, 0)
  const funded = sum("ESCROW_FUND")
  const releasedGross = sum("RELEASE", "CREATOR_FEE")
  const refunded = sum("REFUND")
  const held = Math.max(0, funded - releasedGross - refunded)
  const funding = fundingBreakdown(deal.amount, deal.brandFeePct, deal.processingFeePct)
  const payout = payoutBreakdown(deal.amount, deal.creatorFeePct)
  const signedByMe = isBrand ? deal.brandSignedAt : deal.creatorSignedAt
  const openDispute = deal.disputes.find((d) => d.status === "OPEN")
  const myReview = deal.reviews.find((r) => r.authorId === user.id)
  const theirReview = deal.reviews.find((r) => r.authorId !== user.id)
  const stageIndex = deal.status === "DISPUTED" ? 4 : DEAL_STAGES.findIndex((s) => s.status === deal.status)
  const roundsLeft = MAX_NEGOTIATION_ROUNDS - deal.negotiationRound
  const base = isBrand ? "/brand/deals" : "/creator/deals"
  const milestones = deal.milestones.map((m) => ({
    id: m.id,
    order: m.order,
    title: m.title,
    percent: m.percent,
    amount: m.amount,
    net: payoutBreakdown(m.amount, deal.creatorFeePct).net,
    status: m.status,
    dueDate: m.dueDate?.toISOString() ?? null,
    submissionUrl: m.submissionUrl,
    submissionNote: m.submissionNote,
    revisionNote: m.revisionNote,
    submittedAt: m.submittedAt?.toISOString() ?? null,
    releasedAt: m.releasedAt?.toISOString() ?? null,
    disputeHoursLeft: m.submittedAt ? Math.max(0, Math.round(DISPUTE_WINDOW_HOURS - (Date.now() - m.submittedAt.getTime()) / 3_600_000)) : null,
  }))

  // ── The single most important thing this party should do next ──
  let next: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode; tone: "brand" | "warning" | "danger" | "success" | "muted" }
  const other = isBrand ? deal.creator.user.name : deal.brand.companyName
  switch (deal.status) {
    case "OFFER_SENT":
      next =
        deal.awaitingParty === party
          ? {
              icon: <FileSignature className="size-5" />,
              title: deal.negotiationRound > 0 ? `${other} sent a counter-offer` : isBrand ? "Respond to the offer" : `${other} wants to work with you`,
              body: `${inr(deal.amount)} · ${MODE_LABEL[deal.paymentMode]}. ${roundsLeft > 0 ? `${roundsLeft} negotiation round${roundsLeft === 1 ? "" : "s"} left.` : "Final round — accept or decline."}`,
              action: (
                <OfferActions
                  dealId={deal.id}
                  amount={deal.amount}
                  paymentMode={deal.paymentMode}
                  milestones={deal.milestones.map((m) => ({ title: m.title, percent: m.percent }))}
                  roundsLeft={roundsLeft}
                />
              ),
              tone: "brand",
            }
          : { icon: <Lock className="size-5" />, title: `Waiting for ${other} to respond`, body: "You'll be notified the moment they accept, counter or decline.", tone: "muted" }
      break
    case "CONTRACT_PENDING":
      next = signedByMe
        ? { icon: <Check className="size-5" />, title: "You've signed", body: `Waiting for ${other} to countersign.`, tone: "muted", action: <CancelDeal dealId={deal.id} /> }
        : {
            icon: <FileSignature className="size-5" />,
            title: "Review and sign the contract",
            body: "Terms are generated from the agreed offer. Both signatures are required before escrow can be funded.",
            action: <SignContract dealId={deal.id} signerName={isBrand ? user.name : deal.creator.user.name} />,
            tone: "brand",
          }
      break
    case "CONTRACT_SIGNED":
      next = isBrand
        ? {
            icon: <ShieldCheck className="size-5" />,
            title: "Fund escrow to kick off the work",
            body: `${inr(funding.total)} total — ${inr(funding.escrow)} held safely in escrow until you approve deliverables.`,
            action: <FundEscrow dealId={deal.id} breakdown={funding} brandFeePct={deal.brandFeePct} onHold={!!deal.holdUntil && deal.holdUntil > new Date()} />,
            tone: "brand",
          }
        : { icon: <Lock className="size-5" />, title: "Contract signed — waiting for escrow", body: `Don't start work yet. ${other} is funding ${inr(deal.amount)} into escrow.`, tone: "muted" }
      break
    case "IN_PROGRESS":
    case "FUNDED": {
      const submitted = deal.milestones.find((m) => m.status === "SUBMITTED")
      const revision = deal.milestones.find((m) => m.status === "REVISION_REQUESTED")
      next = isBrand
        ? submitted
          ? { icon: <AlertTriangle className="size-5" />, title: `Review “${submitted.title}”`, body: `Approve to release ${inr(submitted.amount)}, or request a revision. You have ${DISPUTE_WINDOW_HOURS}h to raise a dispute.`, tone: "warning" }
          : { icon: <ShieldCheck className="size-5" />, title: `${inr(held)} secured in escrow`, body: `${other} is working on the deliverables. You'll review each milestone before any money moves.`, tone: "success" }
        : revision
          ? { icon: <AlertTriangle className="size-5" />, title: "Revision requested", body: revision.revisionNote ?? "Update your submission below.", tone: "warning" }
          : submitted
            ? { icon: <Lock className="size-5" />, title: "Submitted — awaiting approval", body: `${other} is reviewing “${submitted.title}”. Payment releases on approval.`, tone: "muted" }
            : { icon: <ShieldCheck className="size-5" />, title: `${inr(held)} is locked for you`, body: "Escrow is funded — deliver the next milestone below to get paid.", tone: "success" }
      break
    }
    case "DISPUTED":
      next = { icon: <AlertTriangle className="size-5" />, title: "Dispute under review", body: `${openDispute?.reason ?? "A dispute is open."} Releases are frozen until the hustl. trust team resolves it (usually within 48h).`, tone: "danger" }
      break
    case "COMPLETED":
      next = myReview
        ? { icon: <Check className="size-5" />, title: "Deal complete", body: "Thanks for leaving a review — it helps the whole marketplace.", tone: "success" }
        : { icon: <Check className="size-5" />, title: "Deal complete — how did it go?", body: `Rate your experience with ${other}.`, action: <ReviewForm dealId={deal.id} subjectName={other} />, tone: "success" }
      break
    default:
      next = { icon: <XCircle className="size-5" />, title: "This deal was cancelled", body: "No funds were moved.", tone: "muted" }
  }

  const TONE = {
    brand: "border-primary/25 bg-accent/60",
    warning: "border-warning/30 bg-warning-soft",
    danger: "border-destructive/30 bg-danger-soft",
    success: "border-success/25 bg-success-soft",
    muted: "bg-card",
  }

  return (
    <div className="space-y-6">
      <Link href={base} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All deals
      </Link>

      <header className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{deal.title}</h1>
            <StatusBadge status={deal.status} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <Link href={counterpart.href} className="flex items-center gap-2 font-medium text-foreground hover:underline">
              <Avatar name={counterpart.name} src={counterpart.image} size={26} />
              {counterpart.name}
              <span className="font-normal text-muted-foreground">{counterpart.sub}</span>
            </Link>
            {deal.brief && <span>Brief: {deal.brief.title}</span>}
            <span>Started {shortDate(deal.createdAt)}</span>
          </div>
        </div>
        <div className="shrink-0 md:text-right">
          <div className="font-display text-3xl font-bold tabular-nums">{inr(deal.amount)}</div>
          <div className="text-sm text-muted-foreground">
            {MODE_LABEL[deal.paymentMode]}
            {!isBrand && <> · you receive {inr(payout.net)}</>}
          </div>
        </div>
      </header>

      {deal.status !== "CANCELLED" && (
        <ol className="grid grid-cols-6 gap-1.5">
          {DEAL_STAGES.map((s, i) => {
            const done = i < stageIndex || deal.status === "COMPLETED"
            const current = i === stageIndex && deal.status !== "COMPLETED"
            return (
              <li key={s.status} className="min-w-0">
                <div className={cn("h-1.5 rounded-full", done ? "bg-primary" : current ? (deal.status === "DISPUTED" ? "bg-destructive" : "bg-primary/45") : "bg-muted")} />
                <div className={cn("mt-2 truncate text-[11px] font-medium sm:text-xs", done || current ? "text-foreground" : "text-muted-foreground")}>{s.label}</div>
              </li>
            )
          })}
        </ol>
      )}

      <section className={cn("flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:items-center", TONE[next.tone])}>
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", next.tone === "danger" ? "bg-destructive/15 text-destructive" : next.tone === "warning" ? "bg-warning/15 text-warning" : next.tone === "success" ? "bg-success/15 text-success" : "bg-primary/10 text-primary")}>
          {next.icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{next.title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{next.body}</p>
        </div>
        {next.action && <div className="shrink-0">{next.action}</div>}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Panel title="Milestones & payouts" description={isBrand ? "Money only moves when you approve a milestone." : "Each approved milestone is paid out to you (minus the 5% platform fee)."}>
            <MilestoneList milestones={milestones} party={party} dealStatus={deal.status} paymentMode={deal.paymentMode} />
          </Panel>

          <Panel title="Messages" description={`Private to you and ${other}. Keep agreements in writing here.`} bodyClassName="p-0">
            <DealChat
              dealId={deal.id}
              currentUserId={user.id}
              messages={deal.messages.map((m) => ({ id: m.id, body: m.body, createdAt: m.createdAt.toISOString(), sender: m.sender }))}
              disabled={deal.status === "CANCELLED"}
            />
          </Panel>

          <Panel title="Contract" description="Generated from the agreed terms. E-signature is legally binding under the IT Act, 2000.">
            <div className="space-y-4 text-sm leading-relaxed">
              <Clause n={1} title="Parties">
                {deal.brand.companyName} (“Brand”) and {deal.creator.user.name}, @{deal.creator.handle} (“Creator”), through the hustl. marketplace.
              </Clause>
              <Clause n={2} title="Scope of work">{deal.deliverables || "As described in the linked brief and deal messages."}</Clause>
              <Clause n={3} title="Compensation">
                {inr(deal.amount)} paid via {MODE_LABEL[deal.paymentMode].toLowerCase()}:{" "}
                {deal.milestones.map((m) => `${m.title} (${m.percent}% · ${inr(m.amount)})`).join("; ")}.
              </Clause>
              <Clause n={4} title="Escrow">
                Brand funds the full amount into hustl. escrow before work begins. Each payment is released only when Brand approves the corresponding deliverable. Either party may raise a dispute within {DISPUTE_WINDOW_HOURS} hours of a submission; releases are frozen until resolution.
              </Clause>
              <Clause n={5} title="Disclosure & usage">
                Creator will label sponsored content per ASCI influencer guidelines. Brand may reshare delivered content on its owned channels for 90 days; paid amplification requires separate written consent.
              </Clause>
              <Clause n={6} title="Timeline">{deal.dueDate ? `Final deliverables due by ${shortDate(deal.dueDate)}.` : "As agreed per milestone."}</Clause>
            </div>
            <div className="mt-5 grid gap-3 border-t pt-4 sm:grid-cols-2">
              <Signature who={deal.brand.companyName} at={deal.brandSignedAt} />
              <Signature who={deal.creator.user.name} at={deal.creatorSignedAt} />
            </div>
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel title="Escrow">
            <dl className="space-y-2.5 text-sm">
              <Row k="Deal value" v={inr(deal.amount)} />
              {isBrand ? (
                <>
                  <Row k={`Platform fee (${Math.round(deal.brandFeePct * 100)}%)`} v={inr(funding.brandFee)} muted />
                  <Row k="Processing (2%)" v={inr(funding.processing)} muted />
                </>
              ) : (
                <Row k="Platform fee (5%)" v={`− ${inr(payout.fee)}`} muted />
              )}
              <div className="my-2 border-t" />
              <Row k="Funded" v={inr(funded)} />
              <Row k="Released" v={inr(releasedGross)} />
              {refunded > 0 && <Row k="Refunded" v={inr(refunded)} />}
              <Row k="Held in escrow" v={inr(held)} strong />
            </dl>
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-muted/70 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
              Funds sit in a segregated escrow account and can't be withdrawn by either party without an approval or dispute resolution.
            </p>
          </Panel>

          {theirReview && (
            <Panel title={`${other}'s review`}>
              <div className="text-warning">{"★".repeat(theirReview.rating)}<span className="text-muted">{"★".repeat(5 - theirReview.rating)}</span></div>
              {theirReview.comment && <p className="mt-2 text-sm text-muted-foreground">“{theirReview.comment}”</p>}
            </Panel>
          )}

          <Panel title="Activity">
            <ol className="relative space-y-4 border-l pl-5">
              {deal.events.slice(0, 12).map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[25px] top-1 size-2.5 rounded-full border-2 border-card bg-primary" />
                  <p className="text-sm font-medium leading-snug">{eventLabel(e.type, e.toStatus)}</p>
                  {e.note && <p className="mt-0.5 text-xs text-muted-foreground">{e.note}</p>}
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {e.actor?.name ? `${e.actor.name} · ` : ""}
                    {timeAgo(e.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          </Panel>

          {["FUNDED", "IN_PROGRESS"].includes(deal.status) && (
            <div className="rounded-xl border border-dashed p-4 text-sm">
              <p className="font-medium">Something wrong?</p>
              <p className="mt-1 text-xs text-muted-foreground">Try messaging first. If you can't agree, our trust team will review evidence from both sides.</p>
              <div className="mt-3">
                <DisputeDialog dealId={deal.id} milestones={deal.milestones.filter((m) => !["RELEASED", "REFUNDED"].includes(m.status)).map((m) => ({ id: m.id, title: m.title }))} />
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function Clause({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="font-mono text-xs text-muted-foreground">{String(n).padStart(2, "0")}</span>
      <div>
        <div className="font-medium">{title}</div>
        <p className="text-muted-foreground">{children}</p>
      </div>
    </div>
  )
}

function Signature({ who, at }: { who: string; at: Date | null }) {
  return (
    <div className={cn("rounded-lg border p-3", at ? "bg-success-soft/60" : "border-dashed")}>
      <div className="text-xs text-muted-foreground">{at ? "Signed by" : "Awaiting signature"}</div>
      <div className={cn("mt-0.5 font-medium", at && "font-display italic")}>{who}</div>
      {at && <div className="text-[11px] text-muted-foreground">{at.toLocaleString("en-IN")}</div>}
    </div>
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

function eventLabel(type: string, to: string | null) {
  const map: Record<string, string> = {
    OFFER: "Offer sent",
    COUNTER: "Counter-offer",
    ACCEPT: "Offer accepted",
    DECLINE: "Offer declined",
    SIGNED: "Contract signed",
    SIGN: "Contract fully executed",
    FUND: "Escrow funded",
    START: "Work started",
    MILESTONE_SUBMITTED: "Deliverable submitted",
    MILESTONE_APPROVED: "Deliverable approved",
    REVISION_REQUESTED: "Revision requested",
    PAYMENT_RELEASED: "Payment released",
    DISPUTE: "Dispute raised",
    RESOLVE: "Dispute resolved",
    COMPLETE: "Deal completed",
    CANCEL: "Deal cancelled",
  }
  return map[type] ?? (to ? label(to) : type)
}
