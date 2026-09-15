import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { ArrowRight, BadgeCheck, CheckCircle2, Circle, FileSignature, Handshake, Lock, PartyPopper, RotateCcw, Send, Sparkles, Star, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, PageHeader, Panel, Pill, ScoreRing, StatCard, TextLink } from "@/components/app/ui"
import { EarningsChart } from "@/components/creator/charts"
import { dueLabel, lastMonths, monthKey, profileChecklist } from "@/components/creator/lib"
import { applicationScore } from "@/lib/ai/match"
import type { Tone } from "@/lib/deals/machine"
import { db } from "@/lib/db"
import { inr, timeAgo } from "@/lib/format"
import { requireCreator } from "@/lib/session"

export const metadata = { title: "Dashboard · hustl." }

type Move = { id: string; href: string; icon: LucideIcon; tag: string; tone: Tone; title: string; detail: string; priority: number; due: number }

const SETTLED = ["APPROVED", "RELEASED", "REFUNDED"]

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()))
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
}

export default async function CreatorDashboard() {
  const { user, creator } = await requireCreator()
  const now = new Date()

  const [releases, offers, contracts, activeDeals, shortlisted, liveBriefs, myApps] = await Promise.all([
    db.transaction.findMany({ where: { type: "RELEASE", deal: { creatorId: creator.id } }, select: { amount: true, createdAt: true } }),
    db.deal.findMany({
      where: { creatorId: creator.id, status: "OFFER_SENT", awaitingParty: "CREATOR" },
      include: { brand: { select: { companyName: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    db.deal.findMany({ where: { creatorId: creator.id, status: "CONTRACT_PENDING", creatorSignedAt: null }, include: { brand: { select: { companyName: true } } } }),
    db.deal.findMany({
      where: { creatorId: creator.id, status: { in: ["FUNDED", "IN_PROGRESS"] } },
      include: { brand: { select: { companyName: true } }, milestones: { orderBy: { order: "asc" } } },
    }),
    db.application.count({ where: { creatorId: creator.id, status: "SHORTLISTED" } }),
    db.brief.findMany({
      where: { status: "PUBLISHED", OR: [{ deadline: null }, { deadline: { gte: now } }] },
      include: { brand: { select: { companyName: true, verified: true, logoUrl: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.application.findMany({ where: { creatorId: creator.id }, select: { briefId: true } }),
  ])

  // KPIs
  const lifetime = releases.reduce((s, t) => s + t.amount, 0)
  const thisMonth = releases.filter((t) => monthKey(t.createdAt) === monthKey(now)).reduce((s, t) => s + t.amount, 0)
  const escrowMilestones = activeDeals.flatMap((d) => d.milestones).filter((m) => m.status !== "RELEASED" && m.status !== "REFUNDED")
  const inEscrow = escrowMilestones.reduce((s, m) => s + m.amount, 0)
  const chart = lastMonths(6, now).map((m) => ({
    label: m.label,
    net: releases.filter((t) => monthKey(t.createdAt) === m.key).reduce((s, t) => s + t.amount, 0),
  }))

  // Next moves
  const moves: Move[] = [
    ...offers.map((d) => ({
      id: `o-${d.id}`,
      href: `/creator/deals/${d.id}`,
      icon: Handshake,
      tag: d.negotiationRound ? "Counter-offer" : "New offer",
      tone: "brand" as Tone,
      title: `${d.brand.companyName} offered ${inr(d.amount)}`,
      detail: `${d.title} · accept, counter or decline`,
      priority: 0,
      due: d.updatedAt.getTime(),
    })),
    ...contracts.map((d) => ({
      id: `c-${d.id}`,
      href: `/creator/deals/${d.id}`,
      icon: FileSignature,
      tag: "Sign contract",
      tone: "warning" as Tone,
      title: `Sign your contract with ${d.brand.companyName}`,
      detail: `${d.title} · ${inr(d.amount)} — escrow is funded after both sign`,
      priority: 1,
      due: d.updatedAt.getTime(),
    })),
  ]
  for (const d of activeDeals) {
    const next = d.milestones.find((m) => !SETTLED.includes(m.status))
    if (!next || !["PENDING", "REVISION_REQUESTED"].includes(next.status)) continue
    const revision = next.status === "REVISION_REQUESTED"
    const due = dueLabel(next.dueDate)
    moves.push({
      id: `m-${next.id}`,
      href: `/creator/deals/${d.id}`,
      icon: revision ? RotateCcw : Send,
      tag: revision ? "Revision requested" : (due?.text ?? "Deliver next"),
      tone: revision ? "danger" : (due?.tone ?? "neutral"),
      title: revision ? `Revise “${next.title}”` : `Deliver “${next.title}”`,
      detail: `${d.title} · ${d.brand.companyName} · ${inr(next.amount)} released on approval`,
      priority: revision || due?.tone === "danger" ? 2 : 3,
      due: next.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER,
    })
  }
  moves.sort((a, b) => a.priority - b.priority || a.due - b.due)

  // Recommendations
  const applied = new Set(myApps.map((a) => a.briefId))
  const recommended = liveBriefs
    .filter((b) => !applied.has(b.id))
    .map((b) => ({ brief: b, match: applicationScore(creator, b) }))
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, 3)

  const checklist = profileChecklist(creator, user.kycVerified)
  const done = checklist.filter((c) => c.done).length
  const strength = Math.round((done / checklist.length) * 100)
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Lifetime earnings" value={inr(lifetime)} icon={Wallet} hint={thisMonth ? `${inr(thisMonth)} paid out this month` : "Net of platform fees"} />
        <StatCard label="In escrow for you" value={inr(inEscrow)} icon={Lock} hint={`${escrowMilestones.length} milestone${escrowMilestones.length === 1 ? "" : "s"} secured by brands`} />
        <StatCard label="Pending offers" value={offers.length} icon={Handshake} hint={offers.length ? "Brands are waiting on your reply" : "No offers awaiting you"} />
        <StatCard label="Shortlisted" value={shortlisted} icon={Star} hint={shortlisted ? "Brands are considering you" : "Apply to briefs to get shortlisted"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Panel
            title="Your next moves"
            description="Ordered by urgency — offers first, then contracts and deliverables."
            action={moves.length > 0 ? <Pill tone="brand">{moves.length} to do</Pill> : undefined}
            bodyClassName="p-0"
          >
            {moves.length === 0 ? (
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

          <Panel title="Earnings by month" description="Net payouts released from escrow, last 6 months." action={<TextLink href="/creator/earnings" className="text-sm">Details</TextLink>}>
            {lifetime === 0 ? (
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
                        <div className="flex items-center justify-between text-sm font-medium">
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
          </Panel>

          <Panel
            title={
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="size-4 text-primary" /> Recommended for you
              </span>
            }
            description="Live briefs ranked by your match score."
            action={<TextLink href="/creator/marketplace" className="text-sm">All</TextLink>}
            bodyClassName="p-0"
          >
            {recommended.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">No new live briefs right now — we&apos;ll notify you when brands post.</p>
            ) : (
              <ul className="divide-y">
                {recommended.map(({ brief, match }) => (
                  <li key={brief.id}>
                    <Link href={`/creator/briefs/${brief.id}`} className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/50">
                      <ScoreRing score={match.score} size={42} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium group-hover:text-primary">{brief.title}</div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Avatar name={brief.brand.companyName} src={brief.brand.logoUrl} size={14} />
                          <span className="truncate">{brief.brand.companyName}</span>
                          {brief.brand.verified && <BadgeCheck className="size-3 shrink-0 text-primary" />}
                          <span>· {brief.budgetPerCreator ? inr(brief.budgetPerCreator) : "Open budget"}</span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {match.disqualifiers[0] ? <span className="text-warning">{match.disqualifiers[0]}</span> : (match.reasons[0] ?? `Posted ${timeAgo(brief.createdAt)}`)}
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
