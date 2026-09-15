// Server-side data helpers for the brand portal.

import "server-only"
import type { CreatorProfile, User } from "@prisma/client"
import { db, json } from "@/lib/db"
import { PLAN_BRAND_FEE } from "@/lib/payments/fees"
import type { OfferBrief } from "./offer-dialog"
import type { MatchRowCreator } from "./match-row"
import { minRate } from "./helpers"

export type CreatorWithUser = CreatorProfile & { user: Pick<User, "name" | "image"> }

export const creatorInclude = { user: { select: { name: true, image: true } } } as const

export const brandFee = (plan: string) => PLAN_BRAND_FEE[plan] ?? 0.08

export function toRowCreator(c: CreatorWithUser): MatchRowCreator {
  return {
    id: c.id,
    handle: c.handle,
    name: c.user.name,
    avatarUrl: c.avatarUrl ?? c.user.image,
    headline: c.headline,
    followers: c.followers,
    engagementRate: c.engagementRate,
    reliabilityScore: c.reliabilityScore,
    verified: c.verified,
    fromRate: minRate(c.rateCard),
  }
}

export function toOfferBrief(b: { id: string; title: string; deliverables: unknown; budgetPerCreator: number }): OfferBrief {
  return { id: b.id, title: b.title, deliverables: json<{ type: string; quantity: number }[]>(b.deliverables, []), budgetPerCreator: b.budgetPerCreator }
}

export async function liveBriefOptions(brandId: string) {
  const briefs = await db.brief.findMany({
    where: { brandId, status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, deliverables: true, budgetPerCreator: true },
  })
  return briefs.map(toOfferBrief)
}

const FUNDING_TYPES = ["ESCROW_FUND", "BRAND_FEE", "PROCESSING_FEE"]
export const isSpend = (type: string) => FUNDING_TYPES.includes(type)
export const SPEND_TYPES = FUNDING_TYPES
