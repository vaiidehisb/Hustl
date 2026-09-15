import type { CreatorScore, FraudFlag, SocialAccount, SocialMetricSnapshot } from "@hustl/db"
import type { CreatorScoreDto, FraudFlagDto, SocialAccountDto, SocialMetricSnapshotDto } from "@hustl/contracts"

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

export function accountDto(a: SocialAccount): SocialAccountDto {
  return {
    id: a.id,
    creatorId: a.creatorId,
    platform: a.platform,
    source: a.source,
    // Self-reported numbers are never presented as verified.
    verified: a.source === "PHYLLO" && a.status === "CONNECTED",
    status: a.status,
    handle: a.handle,
    profileUrl: a.profileUrl,
    followers: a.followers,
    following: a.following,
    postsCount: a.postsCount,
    avgLikes: a.avgLikes,
    avgComments: a.avgComments,
    avgViews: a.avgViews,
    engagementRate: a.engagementRate,
    lastSyncedAt: iso(a.lastSyncedAt),
    syncError: a.syncError,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }
}

export function snapshotDto(s: SocialMetricSnapshot, account: Pick<SocialAccount, "platform" | "source">): SocialMetricSnapshotDto {
  return {
    id: s.id,
    socialAccountId: s.socialAccountId,
    platform: account.platform,
    source: account.source,
    followers: s.followers,
    engagementRate: s.engagementRate,
    avgLikes: s.avgLikes,
    avgComments: s.avgComments,
    avgViews: s.avgViews,
    capturedAt: s.capturedAt.toISOString(),
  }
}

export function scoreDto(s: CreatorScore | null): CreatorScoreDto | null {
  if (!s) return null
  return {
    trustScore: s.trustScore,
    nicheAuthority: s.nicheAuthority,
    reliabilityScore: s.reliabilityScore,
    authenticityScore: s.authenticityScore,
    modelVersion: s.modelVersion,
    signals: (s.signals ?? {}) as Record<string, unknown>,
    computedAt: s.computedAt.toISOString(),
  }
}

export function fraudFlagDto(f: FraudFlag & { creator?: { handle: string } | null }): FraudFlagDto {
  return {
    id: f.id,
    subject: f.subject,
    creatorId: f.creatorId,
    creatorHandle: f.creator?.handle ?? null,
    dealId: f.dealId,
    code: f.code,
    label: f.label,
    severity: f.severity,
    source: f.source,
    details: (f.details ?? {}) as Record<string, unknown>,
    status: f.status,
    reviewerId: f.reviewerId,
    reviewNote: f.reviewNote,
    createdAt: f.createdAt.toISOString(),
    reviewedAt: iso(f.reviewedAt),
  }
}
