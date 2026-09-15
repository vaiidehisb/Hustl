import Link from "next/link"
import { AlertTriangle, Clock, Link2, ShieldCheck, Star, Target, TrendingUp, Trophy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState, PageHeader, Panel, Pill, ScoreRing, StatCard } from "@/components/app/ui"
import { PlatformChart } from "@/components/creator/charts"
import { audienceTier, platformLabel, type SocialAccount } from "@/components/creator/lib"
import { benchmarkER, type FraudFlag } from "@/lib/ai/scoring"
import { db, json } from "@/lib/db"
import { compact, pct, timeAgo } from "@/lib/format"
import { requireCreator } from "@/lib/session"
import { cn } from "@/lib/utils"

export const metadata = { title: "My analytics · hustl." }

export default async function AnalyticsPage() {
  const { creator } = await requireCreator()
  const platforms = json<SocialAccount[]>(creator.platforms, [])
  const flags = json<FraudFlag[]>(creator.fraudFlags, [])
  const [activeDeals, reviews] = await Promise.all([
    db.deal.count({ where: { creatorId: creator.id, status: { in: ["FUNDED", "IN_PROGRESS"] } } }),
    db.review.count({ where: { subjectUserId: creator.userId } }),
  ])

  const bench = benchmarkER(creator.followers)
  const ratio = bench ? creator.engagementRate / bench : 0
  const tier = audienceTier(creator.followers)
  const scaleMax = Math.max(creator.engagementRate, bench) * 1.25 || 0.01

  const scores = [
    {
      key: "trust",
      title: "Trust",
      score: creator.trustScore,
      what: "How safe brands feel working with you.",
      moves: ["Complete deals and ask brands to leave a review", "Get verified — connect socials and complete KYC", "Resolve issues in the deal chat before they become disputes"],
    },
    {
      key: "reliability",
      title: "Reliability",
      score: creator.reliabilityScore,
      what: "Whether you deliver on time, first time.",
      moves: ["Submit milestones before their due date", "Reply to brands within a few hours", "Avoid cancelling after escrow is funded"],
    },
    {
      key: "niche",
      title: "Niche authority",
      score: creator.nicheAuthority,
      what: "How much your audience cares about your niche.",
      moves: ["Keep engagement above your tier benchmark", "Focus on 1–3 niches instead of many", "Complete deals within your niche"],
    },
    {
      key: "authenticity",
      title: "Authenticity",
      score: creator.authenticityScore,
      what: "Whether your audience and engagement look organic.",
      moves: ["Grow steadily — avoid follow-for-follow and giveaways", "Stay away from engagement pods and bought likes", "Keep synced numbers accurate and up to date"],
    },
  ]

  return (
    <div>
      <PageHeader
        title="My analytics"
        description="The numbers brands see when they evaluate you — and what actually moves them."
        actions={
          <Button variant="outline" asChild>
            <Link href="/creator/settings">
              <Link2 className="size-4" /> {creator.lastSyncedAt ? `Synced ${timeAgo(creator.lastSyncedAt)}` : "Connect socials"}
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total followers" value={compact(creator.followers)} icon={TrendingUp} hint={`${tier.name} creator (${tier.range})`} />
        <StatCard label="Engagement rate" value={creator.engagementRate ? pct(creator.engagementRate) : "—"} icon={Target} hint={`Tier benchmark ${pct(bench)}`} />
        <StatCard
          label="30-day growth"
          value={pct(creator.followerGrowth30d)}
          icon={TrendingUp}
          trend={creator.followerGrowth30d > 0.3 ? { value: "unusually fast", positive: false } : undefined}
          hint="Follower change over the last 30 days"
        />
        <StatCard label="Deals completed" value={creator.completedDeals} icon={Trophy} hint={activeDeals ? `${activeDeals} in progress` : "None in progress"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Followers by platform" description="From your connected accounts." className="min-w-0">
          {platforms.length === 0 ? (
            <EmptyState
              icon={Link2}
              title="No accounts connected"
              description="Connect Instagram, YouTube or LinkedIn to see your reach by platform."
              action={
                <Button size="sm" asChild>
                  <Link href="/creator/settings">Connect socials</Link>
                </Button>
              }
            />
          ) : (
            <>
              <PlatformChart data={platforms.map((p) => ({ label: platformLabel(p.platform), followers: p.followers }))} />
              <ul className="mt-4 divide-y border-t text-sm">
                {platforms.map((p) => {
                  const b = benchmarkER(p.followers)
                  return (
                    <li key={p.platform} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{platformLabel(p.platform)}</span> <span className="text-muted-foreground">@{p.handle}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
                        {pct(p.engagementRate)} ER
                        <Pill tone={p.engagementRate >= b ? "success" : "warning"}>{p.engagementRate >= b ? "above" : "below"} tier</Pill>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </Panel>

        <Panel title="Engagement vs your tier" description={`${tier.name} creators (${tier.range}) average ${pct(bench)} engagement.`} className="min-w-0">
          <div className="space-y-4">
            {[
              { label: "You", value: creator.engagementRate, cls: ratio >= 1 ? "bg-success" : "bg-warning" },
              { label: `${tier.name} benchmark`, value: bench, cls: "bg-muted-foreground/40" },
            ].map((row) => (
              <div key={row.label}>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-semibold tabular-nums">{pct(row.value)}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", row.cls)} style={{ width: `${Math.min(100, (row.value / scaleMax) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className={cn("mt-5 rounded-lg p-4 text-sm", ratio >= 1 ? "bg-success-soft" : "bg-warning-soft")}>
            <div className={cn("font-semibold", ratio >= 1 ? "text-success" : "text-warning")}>
              {creator.followers === 0
                ? "Connect socials to benchmark your engagement"
                : ratio >= 1.2
                  ? `${ratio.toFixed(1)}× your tier average — a real selling point`
                  : ratio >= 1
                    ? "Right around your tier average"
                    : `${Math.round((1 - ratio) * 100)}% below your tier average`}
            </div>
            <p className="mt-1 text-muted-foreground">
              {ratio >= 1
                ? "Mention this in pitches — brands pay for attention, not just reach."
                : "Benchmarks fall as audiences grow. Posts that invite saves, shares and replies lift engagement fastest."}
            </p>
          </div>
        </Panel>
      </div>

      <Panel
        title="Your scores"
        description="Recalculated when you save your profile, sync socials or finish a deal. Brands see these on your profile and in match results."
        className="mt-6"
      >
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {scores.map((s) => (
            <div key={s.key} className="flex flex-col">
              <div className="flex items-center gap-3">
                <ScoreRing score={s.score} size={56} />
                <div>
                  <div className="font-semibold">{s.title}</div>
                  <p className="text-xs text-muted-foreground">{s.what}</p>
                </div>
              </div>
              <div className="mt-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">What moves this score</div>
              <ul className="mt-1.5 space-y-1 text-sm text-muted-foreground">
                {s.moves.map((m) => (
                  <li key={m} className="flex gap-2">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-primary" />
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title="Authenticity check" className="min-w-0">
          {flags.length === 0 ? (
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-success-soft text-success">
                <ShieldCheck className="size-5" />
              </span>
              <div>
                <div className="font-medium">No flags on your account</div>
                <p className="mt-0.5 text-sm text-muted-foreground">Your audience growth and engagement look organic.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Our automated checks noticed patterns brands may ask about. Flags don&apos;t block you, but they lower your authenticity score until the numbers
                normalise.
              </p>
              {flags.map((f) => (
                <div key={f.code} className={cn("flex items-start gap-2 rounded-lg px-3 py-2 text-sm", f.severity === "high" ? "bg-danger-soft text-destructive" : "bg-warning-soft text-warning")}>
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <div className="font-medium">{f.label}</div>
                    <div className="text-xs opacity-80">{f.severity} severity</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Deal performance" className="min-w-0 lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { icon: Trophy, label: "Completed", value: String(creator.completedDeals), note: "deals" },
              { icon: Clock, label: "On-time rate", value: creator.completedDeals ? pct(creator.onTimeRate, 0) : "—", note: "of milestones" },
              { icon: Star, label: "Avg rating", value: creator.avgRating ? creator.avgRating.toFixed(1) : "—", note: reviews ? `${reviews} review${reviews === 1 ? "" : "s"}` : "no reviews yet" },
              { icon: Clock, label: "Response time", value: `~${creator.responseHours < 1 ? "<1" : Math.round(creator.responseHours)}h`, note: "average reply" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border p-4">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <s.icon className="size-3.5" /> {s.label}
                </div>
                <div className="mt-1.5 font-display text-2xl font-bold tabular-nums">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.note}</div>
              </div>
            ))}
          </div>
          {creator.completedDeals === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              Your first completed deal unlocks on-time and rating stats — they carry the most weight in brand decisions.{" "}
              <Link href="/creator/marketplace" className="font-medium text-primary hover:underline">
                Find a brief
              </Link>
            </p>
          )}
        </Panel>
      </div>
    </div>
  )
}
