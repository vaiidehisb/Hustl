// Recompute derived AI fields (embedding + scores + fraud flags). Called on
// profile save, social sync, and deal completion — the 24h batch job in prod.

import "server-only"
import { db } from "@/lib/db"
import { briefText, creatorText, embed } from "./embed"
import { scoreCreator } from "./scoring"

export async function refreshCreator(creatorId: string) {
  const c = await db.creatorProfile.findUnique({ where: { id: creatorId }, include: { user: true } })
  if (!c) return
  const [disputes, cancellations] = await Promise.all([
    db.dispute.count({ where: { deal: { creatorId } } }),
    db.deal.count({ where: { creatorId, status: "CANCELLED", fundedAt: { not: null } } }),
  ])
  const scores = scoreCreator({
    followers: c.followers,
    engagementRate: c.engagementRate,
    followerGrowth30d: c.followerGrowth30d,
    completedDeals: c.completedDeals,
    avgRating: c.avgRating,
    onTimeRate: c.onTimeRate,
    responseHours: c.responseHours,
    createdAt: c.createdAt,
    verified: c.verified || c.user.kycVerified,
    disputes,
    cancellations,
    niches: (c.niches as string[]) ?? [],
  })
  await db.creatorProfile.update({
    where: { id: creatorId },
    data: { ...scores, embedding: await embed(creatorText(c)) },
  })
}

export async function refreshBriefEmbedding(briefId: string) {
  const b = await db.brief.findUnique({ where: { id: briefId } })
  if (!b) return
  await db.brief.update({ where: { id: briefId }, data: { embedding: await embed(briefText(b)) } })
}
