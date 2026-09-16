// Metric normalisation: every metrics write inserts a snapshot and recomputes
// the creator's aggregates (followers_total, follower-weighted ER, 30-day growth).

import { prisma, type Prisma, type SocialDataSource, type SocialPlatform } from "@hustl/db"
import { publish, TOPICS } from "@hustl/common"

export const SPIKE_THRESHOLD = 0.2
const DAY_MS = 24 * 60 * 60 * 1000

type AccountMetrics = { followers: number | null; engagementRate: number | null }

export function followersTotal(accounts: AccountMetrics[]) {
  return accounts.reduce((sum, a) => sum + Math.max(0, a.followers ?? 0), 0)
}

/** Σ(followers × ER) / Σ(followers) over accounts that have both values. Null when none. */
export function followerWeightedEngagement(accounts: AccountMetrics[]) {
  let weighted = 0
  let weight = 0
  for (const a of accounts) {
    if (a.followers == null || a.followers <= 0 || a.engagementRate == null) continue
    weighted += a.followers * a.engagementRate
    weight += a.followers
  }
  return weight > 0 ? weighted / weight : null
}

type Snap = { socialAccountId: string; followers: number; capturedAt: Date }

/**
 * Growth over the last 30 days. For each account, the baseline is its oldest
 * snapshot within the window and the current value is its newest; accounts with
 * a single snapshot in the window have no history and are excluded.
 * Returns (Σcurrent − Σbaseline) / Σbaseline, or null when there's no baseline.
 */
export function followerGrowth30d(snapshots: Snap[], now = new Date()) {
  const since = now.getTime() - 30 * DAY_MS
  const byAccount = new Map<string, Snap[]>()
  for (const s of snapshots) {
    if (s.capturedAt.getTime() < since || s.capturedAt.getTime() > now.getTime()) continue
    byAccount.set(s.socialAccountId, [...(byAccount.get(s.socialAccountId) ?? []), s])
  }
  let baseline = 0
  let current = 0
  for (const snaps of byAccount.values()) {
    if (snaps.length < 2) continue
    snaps.sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime())
    baseline += snaps[0].followers
    current += snaps[snaps.length - 1].followers
  }
  return baseline > 0 ? (current - baseline) / baseline : null
}

export type FollowerSpike = {
  socialAccountId: string
  platform: SocialPlatform
  source: SocialDataSource
  previousFollowers: number
  currentFollowers: number
  /** fraction, signed */
  change: number
  previousCapturedAt: string
  capturedAt: string
}

/** A >20% change between consecutive snapshots. */
export function detectSpike(previous: { followers: number } | null, currentFollowers: number) {
  if (!previous || previous.followers <= 0) return null
  const change = (currentFollowers - previous.followers) / previous.followers
  return Math.abs(change) > SPIKE_THRESHOLD ? change : null
}

export type MetricsInput = {
  followers: number
  following?: number | null
  postsCount?: number | null
  avgLikes?: number | null
  avgComments?: number | null
  avgViews?: number | null
  /** fraction */
  engagementRate: number | null
}

type Tx = Prisma.TransactionClient

/** Recomputes creator_profiles aggregates from the creator's active accounts. */
export async function recomputeAggregates(tx: Tx, creatorId: string, now = new Date()) {
  const accounts = await tx.socialAccount.findMany({
    where: { creatorId, status: { not: "DISCONNECTED" } },
    select: { id: true, followers: true, engagementRate: true },
  })
  const snapshots = await tx.socialMetricSnapshot.findMany({
    where: { socialAccountId: { in: accounts.map((a) => a.id) }, capturedAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } },
    select: { socialAccountId: true, followers: true, capturedAt: true },
  })
  const aggregate = {
    followersTotal: followersTotal(accounts),
    engagementRate: followerWeightedEngagement(accounts),
    followerGrowth30d: followerGrowth30d(snapshots, now),
  }
  await tx.creatorProfile.update({ where: { id: creatorId }, data: aggregate })
  return aggregate
}

/**
 * Writes metrics for one social account: updates the account, inserts a
 * snapshot, recomputes aggregates and publishes creator.metrics_updated
 * (with any follower spike, which the scoring consumer passes to fraud analysis).
 */
export async function applyMetrics(
  tx: Tx,
  account: { id: string; creatorId: string; platform: SocialPlatform; source: SocialDataSource },
  metrics: MetricsInput,
  extra: Prisma.SocialAccountUpdateInput = {},
) {
  const now = new Date()
  const previous = await tx.socialMetricSnapshot.findFirst({
    where: { socialAccountId: account.id },
    orderBy: { capturedAt: "desc" },
    select: { followers: true, capturedAt: true },
  })
  await tx.socialAccount.update({
    where: { id: account.id },
    data: {
      followers: metrics.followers,
      following: metrics.following ?? null,
      postsCount: metrics.postsCount ?? null,
      avgLikes: metrics.avgLikes ?? null,
      avgComments: metrics.avgComments ?? null,
      avgViews: metrics.avgViews ?? null,
      engagementRate: metrics.engagementRate,
      ...extra,
    },
  })
  await tx.socialMetricSnapshot.create({
    data: {
      socialAccountId: account.id,
      followers: metrics.followers,
      engagementRate: metrics.engagementRate,
      avgLikes: metrics.avgLikes ?? null,
      avgComments: metrics.avgComments ?? null,
      avgViews: metrics.avgViews ?? null,
      capturedAt: now,
    },
  })
  const aggregate = await recomputeAggregates(tx, account.creatorId, now)
  const change = detectSpike(previous, metrics.followers)
  const spike: FollowerSpike | null =
    change === null || !previous
      ? null
      : {
          socialAccountId: account.id,
          platform: account.platform,
          source: account.source,
          previousFollowers: previous.followers,
          currentFollowers: metrics.followers,
          change,
          previousCapturedAt: previous.capturedAt.toISOString(),
          capturedAt: now.toISOString(),
        }
  await publish(tx, TOPICS.CREATOR_METRICS_UPDATED, account.creatorId, {
    creatorId: account.creatorId,
    socialAccountId: account.id,
    platform: account.platform,
    source: account.source,
    aggregate,
    spikes: spike ? [spike] : [],
  })
  return { aggregate, spike }
}

/** After an account is removed: recompute and notify. */
export async function recomputeAndPublish(creatorId: string) {
  return prisma.$transaction(async (tx) => {
    const aggregate = await recomputeAggregates(tx, creatorId)
    await publish(tx, TOPICS.CREATOR_METRICS_UPDATED, creatorId, { creatorId, aggregate, spikes: [] })
    return aggregate
  })
}
