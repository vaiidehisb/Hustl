// AI module 1 — matching engine, and module 5 — application scoring.
// Weights follow the architecture doc exactly.

import { cosine } from "./embed"
import { benchmarkER } from "./scoring"

export type MatchableCreator = {
  id: string
  followers: number
  engagementRate: number
  reliabilityScore: number
  available: boolean
  niches: unknown
  platforms: unknown
  location: string
  embedding: unknown
  authenticityScore: number
}

export type MatchableBrief = {
  niche: string
  platforms: unknown
  minFollowers: number
  minEngagement: number
  location: string
  embedding: unknown
}

export type MatchResult = { score: number; reasons: string[]; disqualifiers: string[]; similarity: number }

const toPct = (n: number) => Math.max(0, Math.min(1, n))

function platformMatch(c: MatchableCreator, b: MatchableBrief) {
  const wanted = ((b.platforms as string[]) ?? []).map((p) => p.toLowerCase())
  if (!wanted.length) return true
  const has = ((c.platforms as { platform: string }[]) ?? []).map((p) => p.platform.toLowerCase())
  return wanted.some((w) => has.includes(w))
}

function nicheOverlap(c: MatchableCreator, b: MatchableBrief) {
  if (!b.niche) return 0.5
  const niches = ((c.niches as string[]) ?? []).map((n) => n.toLowerCase())
  const target = b.niche.toLowerCase()
  return niches.some((n) => n === target) ? 1 : niches.some((n) => target.includes(n) || n.includes(target)) ? 0.6 : 0
}

function common(c: MatchableCreator, b: MatchableBrief) {
  const similarity = toPct((cosine(c.embedding as number[], b.embedding as number[]) + 0.1) / 0.7)
  const erFit = toPct(c.engagementRate / Math.max(b.minEngagement || benchmarkER(c.followers), 0.001) / 1.5)
  const followerFit = b.minFollowers ? toPct(c.followers / b.minFollowers) : 0.8
  const reasons: string[] = []
  const disqualifiers: string[] = []
  const niche = nicheOverlap(c, b)
  if (niche === 1) reasons.push(`Core ${b.niche} creator`)
  if (c.engagementRate >= benchmarkER(c.followers) * 1.2) reasons.push(`Engagement ${(c.engagementRate * 100).toFixed(1)}% — above tier average`)
  if (c.reliabilityScore >= 80) reasons.push(`Reliability ${c.reliabilityScore}/100`)
  if (b.location && c.location.toLowerCase().includes(b.location.toLowerCase().split(",")[0])) reasons.push(`Based in ${c.location}`)
  if (similarity > 0.6) reasons.push("Content strongly aligned with brief")
  if (b.minFollowers && c.followers < b.minFollowers) disqualifiers.push("Below minimum followers")
  if (!platformMatch(c, b)) disqualifiers.push("Not active on required platform")
  if (c.authenticityScore < 60) disqualifiers.push("Audience authenticity under review")
  if (!c.available) disqualifiers.push("Currently unavailable")
  return { similarity, erFit, followerFit, reasons, disqualifiers, niche }
}

/** Module 1: brief → creators. semantic 40, ER fit 20, follower fit 15, reliability 15, availability 10. */
export function matchScore(c: MatchableCreator, b: MatchableBrief): MatchResult {
  const x = common(c, b)
  const semantic = Math.max(x.similarity, x.niche * 0.85)
  const score =
    semantic * 40 + x.erFit * 20 + x.followerFit * 15 + (c.reliabilityScore / 100) * 15 + (c.available ? 10 : 0)
  return {
    score: Math.round(Math.max(0, score - x.disqualifiers.length * 8)),
    reasons: x.reasons.slice(0, 3),
    disqualifiers: x.disqualifiers,
    similarity: x.similarity,
  }
}

/** Module 5: application → brief. semantic 35, structured features 40, reliability 25. */
export function applicationScore(c: MatchableCreator, b: MatchableBrief): MatchResult {
  const x = common(c, b)
  const structured =
    ((b.minFollowers ? (c.followers >= b.minFollowers ? 1 : 0) : 1) +
      (b.minEngagement ? (c.engagementRate >= b.minEngagement ? 1 : 0) : 1) +
      (platformMatch(c, b) ? 1 : 0) +
      x.niche) /
    4
  const semantic = Math.max(x.similarity, x.niche * 0.85)
  const score = semantic * 35 + structured * 40 + (c.reliabilityScore / 100) * 25
  return { score: Math.round(score), reasons: x.reasons.slice(0, 3), disqualifiers: x.disqualifiers, similarity: x.similarity }
}

export function rankCreators<T extends MatchableCreator>(creators: T[], brief: MatchableBrief, limit = 20) {
  return creators
    .map((c) => ({ creator: c, match: matchScore(c, brief) }))
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, limit)
}
