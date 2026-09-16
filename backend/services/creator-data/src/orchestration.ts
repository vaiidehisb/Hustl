// AI orchestration consumer: on creator-relevant events, refresh the creator's
// embedding, scores and fraud analysis via the AI backend and persist results.
// Any AI failure throws so the event is retried (at-least-once; idempotent writes).

import { z } from "zod"
import { prisma, type Prisma } from "@hustl/db"
import { errors, publish, serviceClient, TOPICS, type EventEnvelope, type Topic } from "@hustl/common"

export const ORCHESTRATION_TOPICS: Topic[] = [TOPICS.CREATOR_METRICS_UPDATED, TOPICS.CREATOR_PROFILE_UPDATED, TOPICS.DEAL_COMPLETED, TOPICS.USER_KYC_VERIFIED]

const scoresResponse = z.object({
  trust_score: z.number(),
  niche_authority: z.number(),
  reliability_score: z.number(),
  model_version: z.string(),
  signals: z.record(z.unknown()).default({}),
})

const fraudResponse = z.object({
  authenticity_score: z.number().nullable().optional(),
  risk_level: z.string().optional(),
  flags: z
    .array(
      z.object({
        code: z.string().min(1),
        label: z.string().optional(),
        severity: z.string().transform((s) => s.toUpperCase()).pipe(z.enum(["LOW", "MEDIUM", "HIGH"])),
        source: z.string().optional(),
        details: z.record(z.unknown()).optional(),
      }),
    )
    .default([]),
})

function aiClient() {
  const url = process.env.AI_SERVICE_URL
  if (!url) throw errors.integrationUnavailable("AI backend", ["AI_SERVICE_URL"])
  return serviceClient("ai", url.replace(/\/$/, ""), { timeoutMs: 30_000 })
}

const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined)

/** Resolves the creator profile id an event refers to; null when the event isn't about a creator. */
export async function resolveCreatorId(event: EventEnvelope): Promise<string | null> {
  const p = event.payload ?? {}
  const direct = str(p.creatorId)
  if (direct) {
    const exists = await prisma.creatorProfile.findUnique({ where: { id: direct }, select: { id: true } })
    return exists?.id ?? null
  }
  if (event.topic === TOPICS.DEAL_COMPLETED) {
    const dealId = str(p.dealId) ?? event.key
    const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { creatorId: true } }).catch(() => null)
    return deal?.creatorId ?? null
  }
  const userId = str(p.userId) ?? (event.topic === TOPICS.USER_KYC_VERIFIED ? event.key : undefined)
  if (userId) {
    const creator = await prisma.creatorProfile.findUnique({ where: { userId }, select: { id: true } }).catch(() => null)
    return creator?.id ?? null
  }
  return null
}

export async function refreshCreatorIntelligence(creatorId: string, context: { spikes?: unknown[]; trigger?: string } = {}) {
  const ai = aiClient()

  // 1. Embedding (used by matching/search).
  await ai.post(`/ai/embeddings/creators/${creatorId}`, {})

  // 2. Scores.
  const scores = scoresResponse.parse(await ai.post(`/ai/scores/refresh/${creatorId}`, {}))
  const scoreData = {
    trustScore: clampScore(scores.trust_score),
    nicheAuthority: clampScore(scores.niche_authority),
    reliabilityScore: clampScore(scores.reliability_score),
    modelVersion: scores.model_version,
    signals: scores.signals as Prisma.InputJsonValue,
    computedAt: new Date(),
  }

  // 3. Fraud analysis, with any follower spikes detected during normalisation.
  const fraud = fraudResponse.parse(
    await ai.post(`/ai/fraud/analyze-creator/${creatorId}`, {
      signals: { follower_spikes: context.spikes ?? [] },
      trigger: context.trigger,
    }),
  )

  return prisma.$transaction(async (tx) => {
    await tx.creatorScore.upsert({
      where: { creatorId },
      create: { creatorId, ...scoreData, authenticityScore: fraud.authenticity_score == null ? null : clampScore(fraud.authenticity_score) },
      update: { ...scoreData, ...(fraud.authenticity_score != null && { authenticityScore: clampScore(fraud.authenticity_score) }) },
    })

    const created: string[] = []
    for (const flag of fraud.flags) {
      const existing = await tx.fraudFlag.findFirst({ where: { subject: "CREATOR", creatorId, code: flag.code, status: "OPEN" } })
      const data = {
        label: flag.label ?? flag.code,
        severity: flag.severity,
        source: flag.source ?? "RULE",
        details: { ...(flag.details ?? {}), riskLevel: fraud.risk_level ?? null } as Prisma.InputJsonValue,
      }
      if (existing) {
        await tx.fraudFlag.update({ where: { id: existing.id }, data })
        continue
      }
      const row = await tx.fraudFlag.create({ data: { subject: "CREATOR", creatorId, code: flag.code, ...data } })
      created.push(row.id)
      if (flag.severity === "HIGH" || flag.severity === "MEDIUM")
        await publish(tx, TOPICS.FRAUD_FLAGGED, creatorId, {
          flagId: row.id,
          subject: "CREATOR",
          creatorId,
          code: row.code,
          label: row.label,
          severity: row.severity,
        })
    }

    // Signals downstream consumers (search indexer) that scores changed.
    await publish(tx, TOPICS.CREATOR_SYNC_COMPLETED, creatorId, { creatorId, stage: "intelligence", trigger: context.trigger ?? null })
    return { scores: scoreData, newFlagIds: created, authenticityScore: fraud.authenticity_score ?? null }
  })
}

export async function handleCreatorEvent(event: EventEnvelope) {
  const creatorId = await resolveCreatorId(event)
  if (!creatorId) return
  const spikes = Array.isArray(event.payload?.spikes) ? (event.payload.spikes as unknown[]) : []
  await refreshCreatorIntelligence(creatorId, { spikes, trigger: event.topic })
}
