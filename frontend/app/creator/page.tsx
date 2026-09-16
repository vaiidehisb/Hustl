import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { ArrowRight, BadgeCheck, CheckCircle2, Circle, FileSignature, Handshake, Lock, PartyPopper, RotateCcw, Send, Sparkles, Star, Wallet } from "lucide-react"
import type { BriefDTO, DealDetail, DealSummary } from "@hustl/contracts"
import { Button } from "@/components/ui/button"
import { Avatar, PageHeader, Panel, Pill, ScoreRing, StatCard, TextLink } from "@/components/app/ui"
import { EarningsChart } from "@/components/creator/charts"
import { ErrorState } from "@/components/creator/states"
import { completionChecklist, dueLabel, monthLabel } from "@/components/creator/lib"
import type { Tone } from "@/lib/deals/machine"
import { inr, timeAgo } from "@/lib/format"
import { getBriefFit, getCreatorOverview, getDealDetails, getMe, getMyDeals, getOpenBriefs, load, soft, type BriefFit } from "./data"

export const metadata = { title: "Dashboard" }

type Move = { id: string; href: string; icon: LucideIcon; tag: string; tone: Tone; title: string; detail: string; priority: number; due: number }

const ACTIONABLE = ["OFFER_SENT", "NEGOTIATING", "AGREED", "FUNDED", "IN_PROGRESS", "DISPUTED", "COMPLETED"]

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()))
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
}

/** Everything the creator can act on right now, straight from the server's `allowedActions`. */
function movesFor(summary: DealSummary, deal: DealDetail): Move[] {
  const moves: Move[] = []
  const updated = new Date(deal.updatedAt).getTime()
  const brand = deal.brand.companyName

  if (deal.allowedActions.includes("ACCEPT"))
    moves.push({
      id: `offer-${deal.id}`,
      href: `/creator/deals/${deal.id}`,
      icon: Handshake,
      tag: deal.negotiationRounds ? `Counter · round ${deal.negotiationRounds}` : "New offer",
      tone: "brand",
      title: `${brand} offered ${inr(deal.amount)}`,
      detail: `${deal.title} · ${deal.allowedActions.includes("COUNTER") ? "accept, counter or decline" : "accept or decline"}`,
      priority: 0,
      due: updated,
    })

  if (deal.allowedActions.includes("SIGN"))
    moves.push({
      id: `sign-${deal.id}`,
      href: `/creator/deals/${deal.id}`,
      icon: FileSignature,
      tag: "Sign contract",
      tone: "warning",
      title: `Sign your contract with ${brand}`,
      detail: `${deal.title} · ${inr(deal.amount)} — escrow is funded after both parties sign`,
      priority: 1,
      due: updated,
    })

  for (const m of deal.milestones) {
    if (!m.allowedActions.includes("SUBMIT")) continue
    const revision = m.status === "REVISION_REQUESTED"
    const due = dueLabel(m.dueDate)
    moves.push({
      id: `ms-${m.id}`,
      href: `/creator/deals/${deal.id}`,
      icon: revision ? RotateCcw : Send,
      tag: revision ? "Revision requested" : (due?.text ?? "Deliver next"),
      tone: revision ? "danger" : (due?.tone ?? "neutral"),
      title: revision ? `Revise “${m.title}”` : `Deliver “${m.title}”`,
      detail: `${deal.title} · ${brand} · ${inr(m.amount)} released on approval`,
      priority: revision || due?.tone === "danger" ? 2 : 3,
      due: m.dueDate ? new Date(m.dueDate).getTime() : Number.MAX_SAFE_INTEGER,
    })
  }

  if (deal.allowedActions.includes("REVIEW"))
    moves.push({
      id: `review-${deal.id}`,
      href: `/creator/deals/${deal.id}`,
      icon: Star,
      tag: "Leave a review",
      tone: "info",
      title: `Review your deal with ${brand}`,
      detail: `${summary.title} · completed ${timeAgo(deal.completedAt ?? deal.updatedAt)}`,
      priority: 4,
      due: updated,
    })

  return moves
}

export default async function CreatorDashboard() {
  const [meResult, overviewResult, dealsResult, briefsResult] = await Promise.all([
    load(getMe),
    load(getCreatorOverview),
    load(() => getMyDeals({ pageSize: 50 })),
    load(() => getOpenBriefs({ pageSize: 10 })),
  ])

  if (!meResult.ok) {
    return (
      <div>
        <PageHeader title="Dashboard" />
        <ErrorState error={meResult.error} />
      </div>
    )
  }

  const { user, creator, profileCompletion } = meResult.data
  const overview = overviewResult.ok ? overviewResult.data : null
  const deals = dealsResult.ok ? dealsResult.data.items : []

  const actionable = deals.filter((d) => ACTIONABLE.includes(d.status)).slice(0, 8)
  const details = await getDealDetails(actionable.map((d) => d.id))
  const moves = actionable
    .flatMap((d) => {
      const detail = details.get(d.id)
      return detail ? movesFor(d, detail) : []
    })
    .sort((a, b) => a.priority - b.priority || a.due - b.due)

  const inboundOffers = deals.filter((d) => (d.status === "OFFER_SENT" || d.status === "NEGOTIATING") && d.awaitingParty === "CREATOR").length
  const chart = (overview?.monthlyEarnings ?? []).slice(-6).map((m) => ({ label: monthLabel(m.month), net: m.amount }))

  // Recommended briefs: the newest open ones the creator hasn't applied to, with a real AI fit score for the top few.
  const candidates: BriefDTO[] = briefsResult.ok ? briefsResult.data.items.filter((b) => !b.myApplication).slice(0, 3) : []
  const fits = await Promise.all(candidates.map((b) => soft(() => getBriefFit(b.id))))
  const recommended = candidates
    .map((brief, i) => ({ brief, fit: fits[i] as BriefFit | null }))
    .sort((a, b) => (b.fit?.matchScore ?? -1) - (a.fit?.matchScore ?? -1))

  const checklist = completionChecklist(profileCompletion)
  const strength = profileCompletion.percent
  const done = checklist.filter((c) => c.done).length
  const firstName = user.name.split(" ")[0]

  return (
    <div>
      <PageHeader
        title={
          <>
            {greeting()}, {firstName}
          </>
        }
        description={
          moves.length
            ? `You have ${moves.length} thing${moves.length === 1 ? "" : "s"} waiting on you. Clearing them keeps your reliability score high.`
            : "You're all caught up. A good time to pitch a new brand."
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/creator/profile">Edit profile</Link>
            </Button>
            <Button asChild>
              <Link href="/creator/marketplace">
                Find briefs <ArrowRight className="size-4" />
              </Link>
            </Button>
          </>
        }
      />

      {overview ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Earned to date" value={inr(overview.totalEarned)} icon={Wallet} hint="Net payouts marked paid" />
          <StatCard
            label="In escrow for you"
            value={inr(overview.pending.inEscrow)}
            icon={Lock}
            hint={overview.pending.approvedAwaitingRelease ? `${inr(overview.pending.approvedAwaitingRelease)} approved, awaiting release` : "Funded by brands before work starts"}
          />
          <StatCard
            label="Pending offers"
            value={inboundOffers}
            icon={Handshake}
            hint={inboundOffers ? "Brands are waiting on your reply" : "No offers awaiting you"}
          />
          <StatCard
            label="Win rate"
            value={overview.applications.winRate !== null ? `${Math.round(overview.applications.winRate * 100)}%` : "—"}
            icon={Star}
            hint={overview.applications.total ? `${overview.applications.offered} of ${overview.applications.total} applications` : "No applications yet"}
          />
        </div>
      ) : (
        !overviewResult.ok && <ErrorState error={overviewResult.error} compact />
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Panel
            title="Your next moves"
            description="Ordered by urgency — offers first, then contracts and deliverables."
            action={moves.length > 0 ? <Pill tone="brand">{moves.length} to do</Pill> : undefined}
            bodyClassName="p-0"
          >
            {!dealsResult.ok ? (
              <div className="p-5">
                <ErrorState error={dealsResult.error} compact />
              </div>
            ) : moves.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <span className="grid size-11 place-items-center rounded-full bg-success-soft text-success">
                  <PartyPopper className="size-5" />
                </span>
                <p className="mt-3 font-medium">Nothing needs you right now</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">New offers, contracts to sign and deliverables due will show up here.</p>
                <Button variant="outline" size="sm" className="mt-4" asChild>
                  <Link href="/creator/marketplace">Browse live briefs</Link>
                </Button>
              </div>
            ) : (
              <ul className="divide-y">
                {moves.slice(0, 6).map((m) => (
                  <li key={m.id}>
                    <Link href={m.href} className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/50">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
                        <m.icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium group-hover:text-primary">{m.title}</span>
                          <Pill tone={m.tone}>{m.tag}</Pill>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{m.detail}</p>
                      </div>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {moves.length > 6 && (
              <div className="border-t px-5 py-3 text-sm">
                <TextLink href="/creator/deals">See all {moves.length} actions</TextLink>
              </div>
            )}
          </Panel>

          <Panel
            title="Earnings by month"
            description="Net payouts released from escrow, last 6 months."
            action={
              <TextLink href="/creator/earnings" className="text-sm">
                Details
              </TextLink>
            }
          >
            {!overview ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Earnings couldn&apos;t be loaded just now.</p>
            ) : overview.totalEarned === 0 ? (
              <div className="py-8 text-center">
                <p className="font-medium">Your first payout is closer than it looks</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  Payments are locked in escrow before you start and released as each milestone is approved — they&apos;ll chart here.
                </p>
              </div>
            ) : (
              <EarningsChart data={chart} />
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-6">
          <Panel title="Profile strength" description="Complete profiles get matched to more briefs.">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-3xl font-bold tabular-nums">{strength}%</span>
              <span className="text-xs text-muted-foreground">
                {done}/{checklist.length} complete
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={strength} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-brand-gradient transition-all" style={{ width: `${strength}%` }} />
            </div>
            <ul className="mt-4 space-y-1">
              {checklist.map((item) => (
                <li key={item.key}>
                  {item.done ? (
                    <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground">
                      <CheckCircle2 className="size-4 shrink-0 text-success" />
                      <span className="line-through decoration-muted-foreground/40">{item.label}</span>
                    </div>
                  ) : (
                    <Link href={item.href} className="group flex items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted">
                      <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 text-sm font-medium">
                          {item.label}
                          <span className="text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100">Fix →</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{item.hint}</p>
                      </div>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            {creator === null && <p className="mt-3 text-xs text-muted-foreground">Your creator profile is still being set up.</p>}
          </Panel>

          <Panel
            title={
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="size-4 text-primary" /> Recommended for you
              </span>
            }
            description="Live briefs with your AI fit score."
            action={
              <TextLink href="/creator/marketplace" className="text-sm">
                All
              </TextLink>
            }
            bodyClassName="p-0"
          >
            {!briefsResult.ok ? (
              <div className="p-5">
                <ErrorState error={briefsResult.error} compact />
              </div>
            ) : recommended.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">No new live briefs right now — we&apos;ll notify you when brands post.</p>
            ) : (
              <ul className="divide-y">
                {recommended.map(({ brief, fit }) => (
                  <li key={brief.id}>
                    <Link href={`/creator/briefs/${brief.id}`} className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/50">
                      {fit ? <ScoreRing score={fit.matchScore} size={42} /> : <span className="grid size-[42px] shrink-0 place-items-center rounded-full border border-dashed text-[10px] text-muted-foreground">fit n/a</span>}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium group-hover:text-primary">{brief.title}</div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Avatar name={brief.brand?.companyName ?? "Brand"} src={brief.brand?.logoUrl} size={14} />
                          <span className="truncate">{brief.brand?.companyName ?? "Brand on hustl."}</span>
                          {brief.brand?.verified && <BadgeCheck className="size-3 shrink-0 text-primary" />}
                          <span>· {inr(brief.budgetPerCreator)}</span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {fit?.disqualifiers[0] ? (
                            <span className="text-warning">{fit.disqualifiers[0]}</span>
                          ) : (
                            (fit?.matchReasons[0] ?? `Posted ${timeAgo(brief.publishedAt ?? brief.createdAt)} · fit score unavailable`)
                          )}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
