// Read-only deal-room panels. Server-safe: no hooks, no client state.
import Link from "next/link"
import { ArrowRight, MessagesSquare } from "lucide-react"
import type { DealDetail, DealOfferDTO, DealSummary } from "@hustl/contracts"
import { MAX_COUNTER_ROUNDS } from "@hustl/contracts"
import { Panel, Pill } from "@/components/app/ui"
import { inr, shortDate, timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"
import { eventLabel, MODE_LABEL } from "./status"

const partyLabel = (deal: DealSummary, party: "BRAND" | "CREATOR") => (party === "BRAND" ? deal.brand.companyName : deal.creator.name)

/** Every round of the negotiation: who proposed what, and what changed. */
export function NegotiationHistory({ deal }: { deal: DealDetail }) {
  const offers = [...deal.offers].sort((a, b) => b.round - a.round)
  if (!offers.length) return null
  const left = deal.counterRoundsRemaining

  return (
    <Panel
      title="Negotiation"
      description={`${offers.length} round${offers.length === 1 ? "" : "s"} so far`}
      action={
        <Pill tone={left > 0 ? "info" : "warning"}>
          {left} of {MAX_COUNTER_ROUNDS} counter round{left === 1 ? "" : "s"} left
        </Pill>
      }
    >
      <ol className="space-y-3">
        {offers.map((offer, i) => (
          <OfferRow key={offer.id} deal={deal} offer={offer} previous={offers[i + 1]} />
        ))}
      </ol>
    </Panel>
  )
}

function OfferRow({ deal, offer, previous }: { deal: DealDetail; offer: DealOfferDTO; previous?: DealOfferDTO }) {
  const mine = offer.proposedBy === deal.yourParty
  const delta = previous ? offer.amount - previous.amount : 0
  return (
    <li className={cn("rounded-lg border p-4", offer.status === "ACCEPTED" && "border-success/30 bg-success-soft/40")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">
            {offer.round === 0 ? "Opening offer" : `Counter · round ${offer.round}`} by {mine ? "you" : partyLabel(deal, offer.proposedBy)}
          </span>
          <Pill tone={offer.status === "ACCEPTED" ? "success" : offer.status === "PENDING" ? "info" : "neutral"}>{offer.status.toLowerCase()}</Pill>
        </div>
        <div className="text-right">
          <div className="font-semibold tabular-nums">{inr(offer.amount)}</div>
          {delta !== 0 && (
            <div className={cn("text-xs tabular-nums", delta > 0 ? "text-warning" : "text-success")}>
              {delta > 0 ? "+" : "−"}
              {inr(Math.abs(delta))} vs previous
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{MODE_LABEL[offer.paymentMode]}</span>
        {offer.dueDate && <span>Due {shortDate(offer.dueDate)}</span>}
        <span>{timeAgo(offer.createdAt)}</span>
      </div>
      {offer.milestones.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {offer.milestones.map((m, i) => (
            <li key={`${m.title}-${i}`} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
              {m.title} · {m.percent}%
            </li>
          ))}
        </ul>
      )}
      {offer.note && <p className="mt-2 rounded-md bg-muted/60 p-3 text-sm">{offer.note}</p>}
    </li>
  )
}

/** Deal event stream, newest first. */
export function ActivityTimeline({ deal, currentUserId }: { deal: DealDetail; currentUserId: string | null }) {
  const events = [...deal.events].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 15)
  if (!events.length) return null
  return (
    <Panel title="Activity">
      <ol className="relative space-y-4 border-l pl-5">
        {events.map((e) => (
          <li key={e.id} className="relative">
            <span className="absolute -left-[25px] top-1 size-2.5 rounded-full border-2 border-card bg-primary" />
            <p className="text-sm font-medium leading-snug">{eventLabel(e.type, e.toStatus)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {e.actorId ? `${e.actorId === currentUserId ? "You" : "Counterparty"} · ` : ""}
              {timeAgo(e.createdAt)}
            </p>
          </li>
        ))}
      </ol>
    </Panel>
  )
}

/**
 * Compact entry point into the shared inbox — the deal room does not host a
 * second message implementation.
 */
export function MessagesCard({ deal, inboxBase }: { deal: DealDetail; inboxBase: string }) {
  const other = deal.yourParty === "BRAND" ? deal.creator.name : deal.brand.companyName
  return (
    <Panel title="Messages" description={`Private thread with ${other}`}>
      <p className="text-sm text-muted-foreground">Questions, revisions and scheduling live in the conversation. Keep agreements in writing — the trust team reads it during a dispute.</p>
      <Link
        href={`${inboxBase}?deal=${deal.id}`}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        <MessagesSquare className="size-4" /> Open conversation <ArrowRight className="size-4" />
      </Link>
    </Panel>
  )
}
