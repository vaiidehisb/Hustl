import type { FastifyRequest } from "fastify"
import { prisma, type MediaAsset, type MediaKind } from "@hustl/db"
import { errors } from "@hustl/common"

/** Shown on public profiles; any signed-in user may fetch them. */
const PROFILE_KINDS: MediaKind[] = ["AVATAR", "LOGO", "PORTFOLIO", "MEDIA_KIT"]
/** Visible to both parties of the deal they belong to. */
const DEAL_KINDS: MediaKind[] = ["DELIVERABLE", "CONTRACT_PDF", "DISPUTE_EVIDENCE", "REPORT"]

export async function dealParties(dealId: string) {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true, brand: { select: { userId: true } }, creator: { select: { userId: true } } },
  })
  if (!deal) return null
  return { dealId: deal.id, brandUserId: deal.brand.userId, creatorUserId: deal.creator.userId }
}

export const isParty = (userId: string | undefined, p: { brandUserId: string; creatorUserId: string }) =>
  !!userId && (p.brandUserId === userId || p.creatorUserId === userId)

/** Internal services, admins, deal parties. Throws 404/403. */
export async function assertDealAccess(req: FastifyRequest, dealId: string) {
  const parties = await dealParties(dealId)
  if (!parties) throw errors.notFound("Deal")
  if (req.internal || req.user?.role === "ADMIN" || isParty(req.user?.id, parties)) return parties
  throw errors.forbidden()
}

export async function canViewAsset(req: FastifyRequest, asset: MediaAsset) {
  if (req.internal || req.user?.role === "ADMIN" || asset.ownerId === req.user?.id) return true
  if (PROFILE_KINDS.includes(asset.kind)) return !!req.user
  if (asset.dealId && DEAL_KINDS.includes(asset.kind)) {
    const parties = await dealParties(asset.dealId)
    return !!parties && isParty(req.user?.id, parties)
  }
  return false
}
