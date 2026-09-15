import { prisma } from "@hustl/db"
import type { PublicReview, ReviewStats } from "@hustl/contracts"

/** Reviews received by a user (creator or brand account), newest first, with aggregate stats. */
export async function reviewsReceivedBy(userId: string, take = 20): Promise<{ reviewStats: ReviewStats; reviews: PublicReview[] }> {
  const [agg, rows] = await Promise.all([
    prisma.review.aggregate({ where: { subjectUserId: userId }, _avg: { rating: true }, _count: { _all: true } }),
    prisma.review.findMany({
      where: { subjectUserId: userId, author: { deletedAt: null } },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        author: {
          select: {
            name: true,
            image: true,
            role: true,
            brand: { select: { companyName: true, slug: true, logoUrl: true, deletedAt: true } },
            creator: { select: { handle: true, avatarUrl: true, deletedAt: true } },
          },
        },
      },
    }),
  ])
  const avg = agg._avg.rating
  return {
    reviewStats: { count: agg._count._all, avgRating: avg === null ? null : Math.round(avg * 100) / 100 },
    reviews: rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
      author: {
        name: r.author.name,
        image: r.author.image,
        role: r.author.role,
        brand: r.author.brand && !r.author.brand.deletedAt ? { companyName: r.author.brand.companyName, slug: r.author.brand.slug, logoUrl: r.author.brand.logoUrl } : null,
        creator: r.author.creator && !r.author.creator.deletedAt ? { handle: r.author.creator.handle, avatarUrl: r.author.creator.avatarUrl } : null,
      },
    })),
  }
}
