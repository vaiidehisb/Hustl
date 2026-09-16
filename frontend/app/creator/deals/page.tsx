import Link from "next/link"
import { ArrowRight, BadgeCheck, CalendarClock, Handshake, Inbox, Lock } from "lucide-react"
import { CREATOR_FEE_RATE, payoutBreakdown } from "@hustl/contracts"
import { Button } from "@/components/ui/button"
import { Avatar, EmptyState, PageHeader, Panel, Pill } from "@/components/app/ui"
import { DealRow } from "@/components/creator/deal-row"
import { ErrorState } from "@/components/creator/states"
import { ACTIVE_DEAL_STATUSES, isInboundOffer, paymentModeLabel } from "@/components/creator/lib"
import { inr, shortDate, timeAgo } from "@/lib/format"
import { getDealDetails, getMyDeals, load } from "../data"

export const metadata = { title: "Offers & deals" }

export default async function DealsPage() {
  const result = await load(() => getMyDeals({ pageSize: 100 }))
  const header = <PageHeader title="Offers & deals" description="Every deal runs offer → contract → escrow → delivery → payout. Brands fund escrow before you start." />

  if (!result.ok) {
    return (
      <div>
        {header}
        <ErrorState error={result.error} />
      </div>
    )
  }

  const deals = result.data.items
  const inbound = deals.filter(isInboundOffer)
  const active = deals.filter((d) => (ACTIVE_DEAL_STATUSES as readonly string[]).includes(d.status) && !isInboundOffer(d))
  const past = deals.filter((d) => !(ACTIVE_DEAL_STATUSES as readonly string[]).includes(d.status))
  const escrowValue = deals.filter((d) => d.status === "FUNDED" || d.status === "IN_PROGRESS").reduce((s, d) => s + d.amount, 0)

  // `allowedActions` only exists on the deal detail — load it for the rows the creator is most likely to act on.
  const details = await getDealDetails([...inbound, ...active].slice(0, 10).map((d) => d.id))

  return (
    <div>
      <PageHeader
        title="Offers & deals"
        description={
          escrowValue
            ? `${inr(escrowValue)} is secured in escrow across your live deals.`
            : "Every deal runs offer → contract → escrow → delivery → payout. Brands fund escrow before you start."
        }
      />

      {deals.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title="No offers or deals yet"
          description="Brands send offers after reviewing your applications or discovering your profile. Apply to a few well-matched briefs to get started."
          action={
            <Button asChild>
              <Link href="/creator/marketplace">Find briefs</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold">Inbound offers</h2>
              {inbound.length > 0 && <Pill tone="brand">{inbound.length} awaiting you</Pill>}
            </div>
            {inbound.length === 0 ? (
              <div className="flex items-center gap-3 rounded-xl border border-dashed bg-card/50 px-5 py-4 text-sm text-muted-foreground">
                <Inbox className="size-4 shrink-0" />
                No offers waiting on you. New offers appear here — you&apos;ll also get a notification.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {inbound.map((d) => {
                  const detail = details.get(d.id)
                  const { net } = payoutBreakdown(d.amount, detail?.feeRates.creator ?? CREATOR_FEE_RATE)
                  return (
                    <div key={d.id} className="relative flex flex-col overflow-hidden rounded-xl border border-primary/25 bg-card p-5 shadow-sm">
                      <div className="absolute inset-x-0 top-0 h-1 bg-brand-gradient" />
                      <div className="flex items-center gap-3">
                        <Avatar name={d.brand.companyName} src={d.brand.logoUrl} size={38} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1 text-sm font-medium">
                            <span className="truncate">{d.brand.companyName}</span>
                            {d.brand.verified && <BadgeCheck className="size-4 shrink-0 text-primary" />}
                          </div>
                          <div className="text-xs text-muted-foreground">Received {timeAgo(d.updatedAt)}</div>
                        </div>
                        <Pill tone={d.negotiationRounds ? "warning" : "brand"}>
                          {d.negotiationRounds ? `Counter · round ${d.negotiationRounds}${detail ? ` of ${d.negotiationRounds + detail.counterRoundsRemaining}` : ""}` : "New offer"}
                        </Pill>
                      </div>
                      <h3 className="mt-3 font-semibold leading-snug">{d.title}</h3>
                      <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
                        <span className="font-display text-2xl font-bold tabular-nums">{inr(d.amount)}</span>
                        <span className="text-xs text-muted-foreground">you receive {inr(net)} after fees</span>
                      </div>
                      {detail?.deliverables && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{detail.deliverables}</p>}
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Lock className="size-3.5" /> {paymentModeLabel(d.paymentMode)}
                          {detail && detail.milestones.length > 1 && ` · ${detail.milestones.length} milestones`}
                        </span>
                        {d.dueDate && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="size-3.5" /> Due {shortDate(d.dueDate)}
                          </span>
                        )}
                      </div>
                      <Button className="mt-4 w-full sm:w-auto sm:self-start" asChild>
                        <Link href={`/creator/deals/${d.id}`}>
                          Review offer <ArrowRight className="size-4" />
                        </Link>
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <Panel title="Active deals" description="Your move is highlighted with a dot." action={<Pill>{active.length}</Pill>} bodyClassName="p-0">
            {active.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">No active deals. Accept an offer to get one moving.</p>
            ) : (
              <div className="divide-y">
                {active.map((d) => (
                  <DealRow key={d.id} deal={d} actions={details.get(d.id)?.allowedActions ?? []} />
                ))}
              </div>
            )}
          </Panel>

          {past.length > 0 && (
            <Panel title="Completed & closed" action={<Pill>{past.length}</Pill>} bodyClassName="p-0">
              <div className="divide-y">
                {past.map((d) => (
                  <DealRow key={d.id} deal={d} />
                ))}
              </div>
            </Panel>
          )}
        </div>
      )}
    </div>
  )
}
