// AI module 2 — creator scoring engine, v1 (weighted formula, min-max
// normalised; no training data needed). v2 swaps in an XGBoost regressor.
// AI module 4 — fraud detection, v1 (rule-based flags + ratio anomaly check).

type CreatorSignals = {
  followers: number
  engagementRate: number // 0.034 = 3.4%
  followerGrowth30d: number // 0.12 = 12%
  completedDeals: number
  avgRating: number // 0–5
  onTimeRate: number // 0–1
  responseHours: number
  createdAt: Date
  verified: boolean
  disputes?: number
  cancellations?: number
  revisionRate?: number // 0–1
  niches: string[]
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n))
const norm = (v: number, min: number, max: number) => clamp(((v - min) / (max - min)) * 100)

export function trustScore(s: CreatorSignals) {
  const ageDays = (Date.now() - s.createdAt.getTime()) / 86_400_000
  return Math.round(
    norm(s.completedDeals, 0, 25) * 0.3 +
      norm(s.avgRating || 3.5, 1, 5) * 0.3 +
      (100 - norm(s.disputes ?? 0, 0, 3)) * 0.15 +
      norm(ageDays, 0, 365) * 0.1 +
      (s.verified ? 100 : 30) * 0.15,
  )
}

export function reliabilityScore(s: CreatorSignals) {
  return Math.round(
    norm(s.onTimeRate, 0.5, 1) * 0.4 +
      (100 - norm(s.revisionRate ?? 0.1, 0, 0.6)) * 0.2 +
      (100 - norm(s.responseHours, 1, 72)) * 0.2 +
      (100 - norm(s.cancellations ?? 0, 0, 3)) * 0.2,
  )
}

/** Engagement benchmarks fall as audiences grow, so compare within tier. */
export function benchmarkER(followers: number) {
  if (followers < 10_000) return 0.06
  if (followers < 100_000) return 0.035
  if (followers < 1_000_000) return 0.02
  return 0.012
}

export function nicheAuthority(s: CreatorSignals) {
  const erRatio = s.engagementRate / benchmarkER(s.followers)
  return Math.round(norm(erRatio, 0.3, 2) * 0.55 + norm(s.niches.length ? 1 / s.niches.length : 0, 0.2, 1) * 0.2 + norm(s.completedDeals, 0, 15) * 0.25)
}

export type FraudFlag = { code: string; label: string; severity: "low" | "medium" | "high" }

export function fraudCheck(s: Pick<CreatorSignals, "followers" | "engagementRate" | "followerGrowth30d">) {
  const flags: FraudFlag[] = []
  if (s.followers >= 100_000 && s.engagementRate < 0.005)
    flags.push({ code: "LOW_ENGAGEMENT", label: "Engagement under 0.5% for a 100K+ audience", severity: "high" })
  if (s.followerGrowth30d > 0.3)
    flags.push({ code: "SUSPICIOUS_GROWTH", label: "Follower growth above 30% in 30 days", severity: "medium" })
  const erRatio = s.engagementRate / benchmarkER(s.followers)
  if (erRatio > 4) flags.push({ code: "ER_ANOMALY", label: "Engagement far above tier benchmark — possible pods/bots", severity: "medium" })
  const penalty = flags.reduce((p, f) => p + (f.severity === "high" ? 30 : f.severity === "medium" ? 15 : 5), 0)
  const authenticityScore = clamp(Math.round(95 - penalty - (erRatio < 0.5 ? 10 : 0)))
  return { authenticityScore, flags, needsReview: authenticityScore < 60 }
}

export function scoreCreator(s: CreatorSignals) {
  const fraud = fraudCheck(s)
  return {
    trustScore: trustScore(s),
    reliabilityScore: reliabilityScore(s),
    nicheAuthority: nicheAuthority(s),
    authenticityScore: fraud.authenticityScore,
    fraudFlags: fraud.flags,
  }
}
