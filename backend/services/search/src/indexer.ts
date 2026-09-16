// Keeps Elasticsearch documents fresh from domain events. Each event re-reads
// the current row from the DB and upserts or deletes the document (idempotent).

import { prisma } from "@hustl/db"
import { TOPICS, type EventEnvelope, type Topic } from "@hustl/common"
import type { SearchEngine } from "./engines"

export const INDEXER_TOPICS: Topic[] = [
  TOPICS.CREATOR_PROFILE_UPDATED,
  TOPICS.CREATOR_METRICS_UPDATED,
  TOPICS.CREATOR_SYNC_COMPLETED, // emitted after scores/fraud refresh
  TOPICS.USER_KYC_VERIFIED,
  TOPICS.DEAL_COMPLETED,
  TOPICS.BRIEF_PUBLISHED,
  TOPICS.BRIEF_UPDATED,
  TOPICS.BRAND_PROFILE_UPDATED,
]

const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : undefined)
const UUID = /^[0-9a-f-]{36}$/i

async function reindexBrandBriefs(engine: SearchEngine, brandId: string) {
  const briefs = await prisma.brief.findMany({ where: { brandId }, select: { id: true } })
  for (const b of briefs) await engine.indexBrief(b.id)
}

export function createIndexHandler(engine: SearchEngine) {
  return async function handle(event: EventEnvelope) {
    const p = event.payload ?? {}
    switch (event.topic) {
      case TOPICS.BRIEF_PUBLISHED:
      case TOPICS.BRIEF_UPDATED: {
        const briefId = str(p.briefId) ?? str(p.id) ?? event.key
        if (UUID.test(briefId)) await engine.indexBrief(briefId)
        return
      }
      case TOPICS.BRAND_PROFILE_UPDATED: {
        const brandId = str(p.brandId) ?? (str(p.userId) && (await prisma.brandProfile.findUnique({ where: { userId: str(p.userId)! } }))?.id)
        if (brandId) await reindexBrandBriefs(engine, brandId)
        return
      }
      case TOPICS.USER_KYC_VERIFIED: {
        const userId = str(p.userId) ?? event.key
        if (!UUID.test(userId)) return
        const [creator, brand] = await Promise.all([
          prisma.creatorProfile.findUnique({ where: { userId }, select: { id: true } }),
          prisma.brandProfile.findUnique({ where: { userId }, select: { id: true } }),
        ])
        if (creator) await engine.indexCreator(creator.id)
        if (brand) await reindexBrandBriefs(engine, brand.id)
        return
      }
      case TOPICS.DEAL_COMPLETED: {
        const creatorId = str(p.creatorId) ?? (await prisma.deal.findUnique({ where: { id: str(p.dealId) ?? event.key }, select: { creatorId: true } }).catch(() => null))?.creatorId
        if (creatorId) await engine.indexCreator(creatorId)
        return
      }
      default: {
        const creatorId =
          str(p.creatorId) ?? (str(p.userId) && (await prisma.creatorProfile.findUnique({ where: { userId: str(p.userId)! }, select: { id: true } }))?.id) ?? undefined
        if (creatorId) await engine.indexCreator(creatorId)
      }
    }
  }
}
