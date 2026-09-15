import Link from "next/link"
import { ArrowRight, CheckCircle2, FileText, Handshake, Inbox, PenLine, Plus, ShieldCheck, Sparkles, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, EmptyState, PageHeader, Panel, Pill, ScoreRing, StatCard, StatusBadge, TextLink } from "@/components/app/ui"
import { SpendChart } from "@/components/brand/charts"
import { MatchRow } from "@/components/brand/match-row"
import { brandFee, creatorInclude, SPEND_TYPES, toOfferBrief, toRowCreator } from "@/components/brand/data"
import { monthKey, monthKeys } from "@/components/brand/helpers"
import { db } from "@/lib/db"
import { rankCreators } from "@/lib/ai/match"
import { compact, inr, timeAgo } from "@/lib/format"
import { requireBrand } from "@/lib/session"

export const metadata = { title: "Dashboard · hustl." }

type QueueItem = { key: string; href: string; icon: typeof Inbox; title: string; detail: string; cta: string; at: Date; tone: "warning" | "brand" | "info" }

export default async function BrandDashboard() {
  const { user, brand } = await requireBrand()
  const since = monthKeys(6)[0].start

  const [activeDeals, openDeals, txs, liveBriefs, applications, newestBrief] = await Promise.all([
    db.deal.count({ where: { brandId: brand.id, status: { in: ["FUNDED", "IN_PROGRESS"] } } }),
    db.deal.findMany({
      where: {
        brandId: brand.id,
        OR: [
          { status: "OFFER_SENT", awaitingParty: "BRAND" },
          { status: "CONTRACT_PENDING", brandSignedAt: null },
          { status: "CONTRACT_SIGNED" },
          { milestones: { some: { status: "SUBMITTED" } } },
        ],
      },
      include: { creator: { include: creatorInclude }, milestones: { where: { status: "SUBMITTED" }, orderBy: { order: "asc" } } },
      orderBy: { updatedAt: "desc" },
    }),
    db.transaction.findMany({ where: { deal: { brandId: brand.id }, status: "SUCCEEDED" }, select: { type: true, amount: true, createdAt: true } }),
    db.brief.count({ where: { brandId: brand.id, status: "PUBLISHED" } }),
    db.application.findMany({
      where: { brief: { brandId: brand.id }, status: { in: ["APPLIED", "SHORTLISTED"] } },
      include: { creator: { include: creatorInclude }, brief: { select: { id: true, title: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    db.brief.findFirst({ where: { brandId: brand.id, status: "PUBLISHED" }, orderBy: { createdAt: "desc" }, include: { applications: { select: { creatorId: true } } } }),
  ])

  const sum = (types: string[]) => txs.filter((t) => types.includes(t.type)).reduce((s, t) => s + t.amount, 0)
  const inEscrow = Math.max(0, sum(["ESCROW_FUND"]) - sum(["RELEASE", "CREATOR_FEE", "REFUND"]))
  const totalSpent = sum(SPEND_TYPES) - sum(["REFUND"])

  const months = monthKeys(6)
  const spend = months.map((m) => ({ month: m.label, escrow: 0, fees: 0 }))
  for (const t of txs) {
    if (!SPEND_TYPES.includes(t.type) || t.createdAt < since) continue
    const i = months.findIndex((m) => m.key === monthKey(t.createdAt))
    if (i < 0) continue
    if (t.type === "ESCROW_FUND") spend[i].escrow += t.amount
    else spend[i].fees += t.amount
  }

  const queue: QueueItem[] = []
  for (const d of openDeals) {
    const name = d.creator.user.name
    for (const m of d.milestones)
      queue.push({ key: m.id, href: `/brand/deals/${d.id}`, icon: CheckCircle2, title: `Review "${m.title}"`, detail: `${name} · ${d.title} · ${inr(m.amount)}`, cta: "Review", at: m.submittedAt ?? d.updatedAt, tone: "warning" })
    if (d.status === "OFFER_SENT" && d.awaitingParty === "BRAND")
      queue.push({ key: d.id, href: `/brand/deals/${d.id}`, icon: Handshake, title: `${name} sent a counter-offer`, detail: `${d.title} · ${inr(d.amount)}`, cta: "Respond", at: d.updatedAt, tone: "brand" })
    if (d.status === "CONTRACT_PENDING" && !d.brandSignedAt)
      queue.push({ key: d.id, href: `/brand/deals/${d.id}`, icon: PenLine, title: "Contract ready to sign", detail: `${name} · ${d.title}`, cta: "Sign", at: d.updatedAt, tone: "info" })
    if (d.status === "CONTRACT_SIGNED")
      queue.push({ key: d.id, href: `/brand/deals/${d.id}`, icon: Wallet, title: "Fund escrow to start", detail: `${name} · ${d.title} · ${inr(d.amount)}`, cta: "Fund", at: d.updatedAt, tone: "brand" })
  }
  queue.sort((a, b) => b.at.getTime() - a.at.getTime())

  const matches = newestBrief
    ? rankCreators(
        await db.creatorProfile.findMany({ where: { id: { notIn: newestBrief.applications.map((a) => a.creatorId) } }, include: creatorInclude }),
        newestBrief,
        3,
      )
    : []

  const firstName = user.name.split(" ")[0]

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={brand.companyName}
        title={`Welcome back, ${firstName}`}
        description="Here's what's moving across your creator campaigns."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/brand/discover">
                <Sparkles /> Discover creators
              </Link>
            </Button>
            <Button asChild>
              <Link href="/brand/briefs/new">
                <Plus /> Post a brief
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active deals" value={activeDeals} icon={Handshake} hint="Funded or in delivery" />
        <StatCard label="In escrow" value={inr(inEscrow)} icon={ShieldCheck} hint="Held until you approve work" />
        <StatCard label="Total spent" value={inr(totalSpent)} icon={Wallet} hint="Creator payments + fees" />
        <StatCard label="Live briefs" value={liveBriefs} icon={FileText} hint={liveBriefs ? "Accepting applications" : "Post one to get applicants"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel
          className="lg:col-span-3"
          title="Needs your attention"
          description={queue.length ? `${queue.length} item${queue.length === 1 ? "" : "s"} waiting on you` : undefined}
          bodyClassName="p-0"
        >
          {queue.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <span className="grid size-11 place-items-center rounded-full bg-success-soft text-success">
                <CheckCircle2 className="size-5" />
              </span>
              <p className="mt-3 font-medium">You're all caught up</p>
              <p className="mt-1 text-sm text-muted-foreground">Counter-offers, contracts and submitted work will appear here.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {queue.slice(0, 8).map((q) => (
                <li key={`${q.key}-${q.cta}`}>
                  <Link href={q.href} className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/50">
                    <span
                      className={
                        q.tone === "warning"
                          ? "grid size-9 shrink-0 place-items-center rounded-lg bg-warning-soft text-warning"
                          : q.tone === "brand"
                            ? "grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
                            : "grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground"
                      }
                    >
                      <q.icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{q.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {q.detail} · {timeAgo(q.at)}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
                      <span className="hidden sm:inline">{q.cta}</span>
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="lg:col-span-2" title="Spend" description="Last 6 months · escrow funding + fees" action={<TextLink href="/brand/payments" className="text-xs">Ledger</TextLink>}>
          <SpendChart data={spend} height={230} />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Recent applications" action={<TextLink href="/brand/briefs" className="text-xs">All briefs</TextLink>} bodyClassName="p-0">
          {applications.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={Inbox}
                title="No open applications"
                description={liveBriefs ? "Creators who apply to your live briefs show up here." : "Publish a brief and matched creators can apply."}
                action={
                  !liveBriefs && (
                    <Button size="sm" asChild>
                      <Link href="/brand/briefs/new">Post a brief</Link>
                    </Button>
                  )
                }
              />
            </div>
          ) : (
            <ul className="divide-y">
              {applications.map((a) => (
                <li key={a.id}>
                  <Link href={`/brand/briefs/${a.brief.id}`} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/50">
                    <Avatar name={a.creator.user.name} src={a.creator.avatarUrl ?? a.creator.user.image} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {a.creator.user.name} <span className="font-normal text-muted-foreground">· {compact(a.creator.followers)}</span>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.brief.title} · asks {inr(a.proposedRate)} · {timeAgo(a.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={a.status} className="hidden sm:inline-flex" />
                    <ScoreRing score={a.matchScore} size={36} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title={
            <span className="flex items-center gap-1.5">
              <Sparkles className="size-4 text-primary" /> Top AI matches
            </span>
          }
          description={newestBrief ? `For "${newestBrief.title}"` : "Ranked against your newest live brief"}
          action={newestBrief && <TextLink href={`/brand/briefs/${newestBrief.id}?tab=matches`} className="text-xs">See all</TextLink>}
          bodyClassName="py-0"
        >
          {!newestBrief ? (
            <div className="py-5">
              <EmptyState
                icon={Sparkles}
                title="Matches need a live brief"
                description="Describe your campaign in plain words — we'll parse it and rank creators by fit."
                action={
                  <Button size="sm" asChild>
                    <Link href="/brand/briefs/new">Post a brief</Link>
                  </Button>
                }
              />
            </div>
          ) : matches.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No creators to rank yet.</p>
          ) : (
            <div className="divide-y">
              {matches.map(({ creator, match }) => (
                <MatchRow
                  key={creator.id}
                  creator={toRowCreator(creator)}
                  match={match}
                  brief={toOfferBrief(newestBrief)}
                  brandFeePct={brandFee(brand.plan)}
                  kycVerified={user.kycVerified}
                  compactView
                />
              ))}
            </div>
          )}
        </Panel>
      </div>

      {!user.kycVerified && (
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-5 sm:flex-row sm:items-center">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-warning-soft text-warning">
            <ShieldCheck className="size-5" />
          </span>
          <div className="flex-1">
            <p className="font-medium">Verify your business</p>
            <p className="text-sm text-muted-foreground">Unlocks upfront payments for top creators and a verified badge on your public profile.</p>
          </div>
          <Pill tone="warning">Unverified</Pill>
          <Button variant="outline" size="sm" asChild>
            <Link href="/brand/settings#kyc">Verify now</Link>
          </Button>
        </div>
      )}
    </div>
  )
}
