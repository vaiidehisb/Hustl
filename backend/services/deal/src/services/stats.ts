// Delivery aggregates on creator_profiles that deal-service maintains:
// completed/cancelled deals, average rating, on-time rate, revision rate.

import type { Tx } from "../lib/deal-access"

export async function recomputeCreatorStats(tx: Tx, creatorId: string) {
  const creator = await tx.creatorProfile.findUnique({ where: { id: creatorId }, select: { userId: true } })
  if (!creator) return
  const [completedDeals, cancelledDeals, milestones, rating] = await Promise.all([
    tx.deal.count({ where: { creatorId, status: "COMPLETED" } }),
    // Only deals cancelled after terms were agreed count against the creator.
    tx.deal.count({ where: { creatorId, status: "CANCELLED", contract: { isNot: null } } }),
    tx.milestone.findMany({ where: { deal: { creatorId, status: "COMPLETED" } }, select: { dueDate: true, submittedAt: true, revisionCount: true } }),
    tx.review.aggregate({ where: { subjectUserId: creator.userId }, _avg: { rating: true } }),
  ])
  const dated = milestones.filter((m) => m.dueDate && m.submittedAt)
  const submitted = milestones.filter((m) => m.submittedAt)
  const round = (n: number) => Math.round(n * 1000) / 1000
  await tx.creatorProfile.update({
    where: { id: creatorId },
    data: {
      completedDeals,
      cancelledDeals,
      onTimeRate: dated.length ? round(dated.filter((m) => m.submittedAt! <= m.dueDate!).length / dated.length) : null,
      revisionRate: submitted.length ? round(submitted.filter((m) => m.revisionCount > 0).length / submitted.length) : null,
      avgRating: rating._avg.rating != null ? round(rating._avg.rating) : null,
    },
  })
}
