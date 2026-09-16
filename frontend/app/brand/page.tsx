import Link from "next/link"
import { ArrowRight, CheckCircle2, FileText, Handshake, Inbox, PenLine, Plus, ShieldCheck, Sparkles, Wallet } from "lucide-react"
import type { ApplicationDTO, DealDetail, DealSummary } from "@hustl/contracts"
import { Button } from "@/components/ui/button"
import { Avatar, EmptyState, PageHeader, Panel, Pill, ScoreRing, StatCard, TextLink } from "@/components/app/ui"
import { SpendChart } from "@/components/brand/charts"
import { MatchRow } from "@/components/brand/match-row"
import { BrandStatusBadge } from "@/components/brand/status"
import { ErrorPanel, AiErrorPanel } from "@/components/brand/error-panel"
import { loadApplications, loadBriefs, loadDeals, loadMatches, loadMe, loadOverview, soft, dealDetail } from "@/components/brand/data"
import { looksActionable, monthLabel } from "@/components/brand/helpers"
import { compact, inr, timeAgo } from "@/lib/format"
import { requireRole } from "@/lib/auth/session"

export const metadata = { title: "Dashboard · hustl." }

type QueueItem = { key: string; href: string; icon: typeof Inbox; title: string; detail: string; cta: string; at: string; tone: "warning" | "brand" | "info" }

/** The queue is derived from `allowedActions` on each deal the API says we can act on. */
function queueFor(deal: DealDetail): QueueItem[] {
  const out: QueueItem[] = []
  const who = deal.creator.name
  const href = `/brand/deals/${deal.id}`
  const actions = new Set(deal.allowedActions)

  if (actions.has("ACCEPT") || actions.has("COUNTER"))
    out.push({ key: `${deal.id}-respond`, href, icon: Handshake, title: `${who} is waiting on your response`, detail: `${deal.title} · ${inr(deal.amount)}`, cta: "Respond", at: deal.updatedAt, tone: "brand" })
  if (actions.has("SIGN")) out.push({ key: `${deal.id}-sign`, href, icon: PenLine, title: "Contract ready to sign", detail: `${who} · ${deal.title}`, cta: "Sign", at: deal.updatedAt, tone: "info" })
  if (actions.has("FUND"))
    out.push({ key: `${deal.id}-fund`, href, icon: Wallet, title: "Fund escrow to start", detail: `${who} · ${deal.title} · ${inr(deal.amount)}`, cta: "Fund", at: deal.updatedAt, tone: "brand" })
  if (actions.has("REVIEW")) out.push({ key: `${deal.id}-review`, href, icon: CheckCircle2, title: `Leave a review for ${who}`, detail: deal.title, cta: "Review", at: deal.updatedAt, tone: "info" })

  for (const m of deal.milestones) {
    if (!m.allowedActions.includes("APPROVE")) continue
    out.push({
      key: m.id,
      href,
      icon: CheckCircle2,
      title: `Review "${m.title}"`,
      detail: `${who} · ${deal.title} · ${inr(m.amount)}`,
      cta: "Review",
      at: m.submittedAt ?? deal.updatedAt,
      tone: "warning",
    })
  }
  return out
}

export default async function BrandDashboard() {
  const session = await requireRole("BRAND", "/brand")
  const [overview, dealsRes, briefsRes, meRes] = await Promise.all([loadOverview(), loadDeals({ pageSize: 50 }), loadBriefs({ pageSize: 20 }), loadMe()])

  const brand = meRes.ok ? meRes.data.brand : null
  const kycVerified = meRes.ok && meRes.data.user.kycStatus === "VERIFIED"
  const plan = brand?.plan ?? "STARTER"

  const deals: DealSummary[] = dealsRes.ok ? dealsRes.data : []
  const candidates = deals.filter(looksActionable).slice(0, 6)
  const details = await Promise.all(candidates.map((d) => soft(() => dealDetail(d.id))))
  const queue = details
    .filter((d): d is DealDetail => !!d)
    .flatMap(queueFor)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))

  const liveBriefs = briefsRes.ok ? briefsRes.data.filter((b) => b.status === "PUBLISHED") : []
  const newestBrief = liveBriefs[0] ?? null

  const [appsRes, matchesRes] = await Promise.all([
    newestBrief ? loadApplications(newestBrief.id, { status: "APPLIED", pageSize: 5 }) : null,
    newestBrief ? loadMatches(newestBrief.id, 3) : null,
  ])
  const applications: ApplicationDTO[] = appsRes?.ok ? appsRes.data : []

  const spend = (overview.ok ? overview.data.monthlySpend.slice(-6) : []).map((m) => ({ month: monthLabel(m.month), amount: m.amount }))
  const activeDeals = overview.ok ? overview.data.dealsByStatus.FUNDED + overview.data.dealsByStatus.IN_PROGRESS : 0
  const firstName = session.name.split(" ")[0]

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={brand?.companyName}
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

      {overview.ok ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Active deals" value={activeDeals} icon={Handshake} hint="Funded or in delivery" />
          <StatCard label="In escrow" value={inr(overview.data.escrowHeld)} icon={ShieldCheck} hint="Held until you approve work" />
          <StatCard label="Total spent" value={inr(overview.data.totalSpend)} icon={Wallet} hint="Creator payments + fees" />
          <StatCard
            label="Live briefs"
            value={overview.data.activeBriefs}
            icon={FileText}
            hint={overview.data.activeBriefs ? "Accepting applications" : "Post one to get applicants"}
          />
        </div>
      ) : (
        <ErrorPanel error={overview.error} title="Couldn't load your numbers" />
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel
          className="lg:col-span-3"
          title="Needs your attention"
          description={queue.length ? `${queue.length} item${queue.length === 1 ? "" : "s"} waiting on you` : undefined}
          bodyClassName="p-0"
        >
          {!dealsRes.ok ? (
            <div className="p-5">
              <ErrorPanel error={dealsRes.error} compact />
            </div>
          ) : queue.length === 0 ? (
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
                <li key={q.key}>
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

        <Panel
          className="lg:col-span-2"
          title="Spend"
          description="Last 6 months · escrow funding + fees"
          action={
            <TextLink href="/brand/payments" className="text-xs">
              Ledger
            </TextLink>
          }
        >
          {overview.ok ? <SpendChart data={spend} height={230} /> : <ErrorPanel error={overview.error} compact />}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="New applications"
          description={newestBrief ? `For "${newestBrief.title}"` : undefined}
          action={
            <TextLink href="/brand/briefs" className="text-xs">
              All briefs
            </TextLink>
          }
          bodyClassName="p-0"
        >
          {appsRes && !appsRes.ok ? (
            <div className="p-5">
              <ErrorPanel error={appsRes.error} compact />
            </div>
          ) : applications.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={Inbox}
                title="No open applications"
                description={liveBriefs.length ? "Creators who apply to your live briefs show up here." : "Publish a brief and matched creators can apply."}
                action={
                  !liveBriefs.length && (
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
                  <Link href={`/brand/briefs/${a.briefId}`} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/50">
                    <Avatar name={a.creator?.name ?? "Creator"} src={a.creator?.avatarUrl} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {a.creator?.name ?? "Creator"}
                        {a.creator ? <span className="font-normal text-muted-foreground"> · {compact(a.creator.followersTotal)}</span> : null}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        asks {inr(a.proposedRate)} · {timeAgo(a.createdAt)}
                      </p>
                    </div>
                    <BrandStatusBadge status={a.status} className="hidden sm:inline-flex" />
                    {a.matchScore !== null && <ScoreRing score={Math.round(a.matchScore)} size={36} />}
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
          action={
            newestBrief && (
              <TextLink href={`/brand/briefs/${newestBrief.id}?tab=matches`} className="text-xs">
                See all
              </TextLink>
            )
          }
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
          ) : matchesRes && !matchesRes.ok ? (
            <div className="py-5">
              <AiErrorPanel error={matchesRes.error} compact />
            </div>
          ) : !matchesRes?.ok || matchesRes.data.matches.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No creators matched this brief yet.</p>
          ) : (
            <div className="divide-y">
              {matchesRes.data.matches.map((m) => (
                <MatchRow
                  key={m.creator.id}
                  match={m}
                  brief={{ id: newestBrief.id, title: newestBrief.title, deliverables: newestBrief.deliverables, budgetPerCreator: newestBrief.budgetPerCreator }}
                  brandPlan={plan}
                  kycVerified={kycVerified}
                  compactView
                />
              ))}
            </div>
          )}
        </Panel>
      </div>

      {meRes.ok && !kycVerified && (
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-5 sm:flex-row sm:items-center">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-warning-soft text-warning">
            <ShieldCheck className="size-5" />
          </span>
          <div className="flex-1">
            <p className="font-medium">Verify your business</p>
            <p className="text-sm text-muted-foreground">Unlocks upfront payments for top creators and a verified badge on your public profile.</p>
          </div>
          <Pill tone="warning">{meRes.data.user.kycStatus === "PENDING" ? "Under review" : "Unverified"}</Pill>
          <Button variant="outline" size="sm" asChild>
            <Link href="/brand/settings#kyc">
              {meRes.data.user.kycStatus === "PENDING" ? "View status" : "Request verification"}
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}
