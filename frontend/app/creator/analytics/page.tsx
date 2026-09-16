import Link from "next/link"
import { Clock, Link2, RotateCcw, Star, Target, TrendingUp, Trophy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState, PageHeader, Panel, Pill, ScoreRing, StatCard } from "@/components/app/ui"
import { PlatformChart } from "@/components/creator/charts"
import { ErrorState } from "@/components/creator/states"
import { SELF_REPORTED_LABEL, audienceTier, isInsufficient, platformLabel, scoreGroups, signalGroup, signalLabel } from "@/components/creator/lib"
import { compact, pct, timeAgo } from "@/lib/format"
import { getCreatorMetrics, getCreatorOverview, getMe, load, soft } from "../data"

export const metadata = { title: "My analytics" }

export default async function AnalyticsPage() {
  const [meResult, overviewResult] = await Promise.all([load(getMe), load(getCreatorOverview)])

  if (!meResult.ok) {
    return (
      <div>
        <PageHeader title="My analytics" />
        <ErrorState error={meResult.error} />
      </div>
    )
  }

  const creator = meResult.data.creator
  const overview = overviewResult.ok ? overviewResult.data : null
  const metrics = creator ? await soft(() => getCreatorMetrics(creator.id)) : null

  const aggregate = metrics?.aggregate ?? null
  const platforms = metrics?.platforms.filter((p) => p.status !== "DISCONNECTED") ?? []
  const score = metrics?.score ?? null
  const tier = audienceTier(aggregate?.followersTotal ?? 0)
  const lastSyncedAt = platforms.map((p) => p.lastSyncedAt).filter(Boolean).sort().at(-1) ?? null

  return (
    <div>
      <PageHeader
        title="My analytics"
        description="The numbers brands see when they evaluate you — and exactly what each score was based on."
        actions={
          <Button variant="outline" asChild>
            <Link href="/creator/settings">
              <Link2 className="size-4" /> {lastSyncedAt ? `Synced ${timeAgo(lastSyncedAt)}` : "Connect socials"}
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total followers"
          value={aggregate ? compact(aggregate.followersTotal) : "—"}
          icon={TrendingUp}
          hint={aggregate ? `${tier.name} creator (${tier.range})` : "Connect an account to see your reach"}
        />
        <StatCard
          label="Engagement rate"
          value={aggregate?.engagementRate != null ? pct(aggregate.engagementRate) : "—"}
          icon={Target}
          hint={aggregate?.engagementRate != null ? "Follower-weighted across your accounts" : "Not enough data yet"}
        />
        <StatCard
          label="30-day growth"
          value={aggregate?.followerGrowth30d != null ? pct(aggregate.followerGrowth30d) : "—"}
          icon={TrendingUp}
          hint={aggregate?.followerGrowth30d != null ? "Follower change over the last 30 days" : "Not enough snapshot history yet"}
        />
        <StatCard
          label="Deals completed"
          value={overview?.completedDeals ?? "—"}
          icon={Trophy}
          hint={overview ? (overview.activeDeals ? `${overview.activeDeals} in progress` : "None in progress") : "Deal stats unavailable"}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Followers by platform" description="From the accounts on your profile." className="min-w-0">
          {platforms.length === 0 ? (
            <EmptyState
              icon={Link2}
              title="No accounts connected"
              description="Add Instagram, YouTube or LinkedIn to see your reach by platform."
              action={
                <Button size="sm" asChild>
                  <Link href="/creator/settings">Connect socials</Link>
                </Button>
              }
            />
          ) : (
            <>
              <PlatformChart data={platforms.map((p) => ({ label: platformLabel(p.platform), followers: p.followers ?? 0 }))} />
              <ul className="mt-4 divide-y border-t text-sm">
                {platforms.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{platformLabel(p.platform)}</span> <span className="text-muted-foreground">@{p.handle}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
                      {p.engagementRate != null ? `${pct(p.engagementRate)} ER` : "ER —"}
                      {p.source === "PHYLLO" ? <Pill tone="success">Verified</Pill> : <Pill tone="warning">{SELF_REPORTED_LABEL}</Pill>}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>

        <Panel title="Deal performance" description="From your completed deals and reviews." className="min-w-0">
          {!overview ? (
            !overviewResult.ok ? (
              <ErrorState error={overviewResult.error} compact />
            ) : null
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: Clock, label: "On-time rate", value: overview.onTimeRate !== null ? pct(overview.onTimeRate, 0) : "—", note: overview.onTimeRate !== null ? "of milestones" : "Not enough data yet" },
                  { icon: RotateCcw, label: "Revision rate", value: overview.revisionRate !== null ? pct(overview.revisionRate, 0) : "—", note: overview.revisionRate !== null ? "of milestones" : "Not enough data yet" },
                  {
                    icon: Star,
                    label: "Avg rating",
                    value: overview.avgRating !== null ? overview.avgRating.toFixed(1) : "—",
                    note: overview.reviewCount ? `${overview.reviewCount} review${overview.reviewCount === 1 ? "" : "s"}` : "No reviews yet",
                  },
                  {
                    icon: Trophy,
                    label: "Win rate",
                    value: overview.applications.winRate !== null ? pct(overview.applications.winRate, 0) : "—",
                    note: overview.applications.total ? `${overview.applications.offered}/${overview.applications.total} applications` : "No applications yet",
                  },
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
              {overview.completedDeals === 0 && (
                <p className="mt-4 text-sm text-muted-foreground">
                  Your first completed deal unlocks on-time and rating stats — they carry the most weight in brand decisions.{" "}
                  <Link href="/creator/marketplace" className="font-medium text-primary hover:underline">
                    Find a brief
                  </Link>
                </p>
              )}
            </>
          )}
        </Panel>
      </div>

      <Panel
        title="Your scores"
        description={
          score
            ? `Model ${score.modelVersion}, computed ${timeAgo(score.computedAt)}. Each score lists the signals it used — signals with no data are shown as such instead of being guessed.`
            : "Scores are computed once you have social data or a completed deal."
        }
        className="mt-6"
      >
        {!score ? (
          <p className="text-sm text-muted-foreground">
            No scores yet. Connect a social account and complete your profile — scoring runs automatically afterwards.{" "}
            <Link href="/creator/settings" className="font-medium text-primary hover:underline">
              Connect socials
            </Link>
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {scoreGroups(score).map((g) => {
              const signals = signalGroup(score.signals, g.key)
              return (
                <div key={g.key} className="flex min-w-0 flex-col">
                  <div className="flex items-center gap-3">
                    <ScoreRing score={g.score} size={56} />
                    <div className="min-w-0">
                      <div className="font-semibold">{g.title}</div>
                      <p className="text-xs text-muted-foreground">{g.what}</p>
                    </div>
                  </div>
                  <div className="mt-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Signals used</div>
                  {signals.length === 0 ? (
                    <p className="mt-1.5 text-sm text-muted-foreground">Not enough data yet.</p>
                  ) : (
                    <ul className="mt-1.5 space-y-1.5 text-sm">
                      {signals.map((s) => (
                        <li key={s.name} className="flex items-start justify-between gap-2">
                          <span className="min-w-0">
                            <span className="text-foreground">{signalLabel(s.name)}</span>
                            {s.detail && <span className="block text-xs text-muted-foreground">{s.detail}</span>}
                          </span>
                          {isInsufficient(s) ? (
                            <Pill tone="neutral">Not enough data yet</Pill>
                          ) : (
                            <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{Math.round(s.normalized * 100)}/100</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
            {score.authenticityScore !== null && (
              <div className="flex min-w-0 flex-col">
                <div className="flex items-center gap-3">
                  <ScoreRing score={score.authenticityScore} size={56} />
                  <div className="min-w-0">
                    <div className="font-semibold">Authenticity</div>
                    <p className="text-xs text-muted-foreground">Whether your audience and growth look organic.</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">Computed by our fraud checks from your follower history and engagement pattern.</p>
              </div>
            )}
          </div>
        )}
      </Panel>

      {metrics && metrics.snapshots.length === 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          We only have one snapshot of your accounts so far — growth trends appear once there is more than 30 days of history.
        </p>
      )}
    </div>
  )
}
