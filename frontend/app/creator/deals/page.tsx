import Link from "next/link"
import { ArrowRight, BadgeCheck, CalendarClock, Handshake, Inbox, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, EmptyState, PageHeader, Panel, Pill } from "@/components/app/ui"
import { DealRow } from "@/components/creator/deal-row"
import { creatorNextStep, paymentModeLabel } from "@/components/creator/lib"
import { MAX_NEGOTIATION_ROUNDS } from "@/lib/deals/machine"
import { payoutBreakdown } from "@/lib/payments/fees"
import { db } from "@/lib/db"
import { inr, shortDate, timeAgo } from "@/lib/format"
import { requireCreator } from "@/lib/session"

export const metadata = { title: "Offers & deals · hustl." }

const ACTIVE = ["OFFER_SENT", "CONTRACT_PENDING", "CONTRACT_SIGNED", "FUNDED", "IN_PROGRESS", "DISPUTED"]

export default async function DealsPage() {
  const { creator } = await requireCreator()
  const deals = await db.deal.findMany({
    where: { creatorId: creator.id },
    include: {
      brand: { select: { companyName: true, logoUrl: true, verified: true } },
      milestones: { orderBy: { order: "asc" }, select: { title: true, status: true, dueDate: true, order: true, amount: true } },
    },
    orderBy: { updatedAt: "desc" },
  })

  const inbound = deals.filter((d) => d.status === "OFFER_SENT" && d.awaitingParty === "CREATOR")
  const active = deals
    .filter((d) => ACTIVE.includes(d.status) && !(d.status === "OFFER_SENT" && d.awaitingParty === "CREATOR"))
    .sort((a, b) => Number(creatorNextStep(b).yourMove) - Number(creatorNextStep(a).yourMove))
  const past = deals.filter((d) => !ACTIVE.includes(d.status))
  const activeValue = active.filter((d) => ["FUNDED", "IN_PROGRESS"].includes(d.status)).reduce((s, d) => s + d.amount, 0)

  return (
    <div>
      <PageHeader
        title="Offers & deals"
        description={
          activeValue
            ? `${inr(activeValue)} is secured in escrow across your live deals.`
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
                  const { net } = payoutBreakdown(d.amount, d.creatorFeePct)
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
                        <Pill tone={d.negotiationRound ? "warning" : "brand"}>
                          {d.negotiationRound ? `Counter · round ${d.negotiationRound} of ${MAX_NEGOTIATION_ROUNDS}` : "New offer"}
                        </Pill>
                      </div>
                      <h3 className="mt-3 font-semibold leading-snug">{d.title}</h3>
                      <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
                        <span className="font-display text-2xl font-bold tabular-nums">{inr(d.amount)}</span>
                        <span className="text-xs text-muted-foreground">you receive {inr(net)} after fees</span>
                      </div>
                      {d.deliverables && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{d.deliverables}</p>}
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Lock className="size-3.5" /> {paymentModeLabel(d.paymentMode)}
                          {d.milestones.length > 1 && ` · ${d.milestones.length} milestones`}
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
                  <DealRow key={d.id} deal={d} />
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
