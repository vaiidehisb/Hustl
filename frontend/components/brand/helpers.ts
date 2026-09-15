// Pure display helpers shared across brand portal pages (server + client safe).

// NOTE: no "@/lib/db" import here — this file is also used by client components.
const json = <T,>(value: unknown, fallback: T): T => (value ?? fallback) as T

export const PAYMENT_MODE_LABEL: Record<string, string> = {
  COMPLETION: "On completion",
  UPFRONT: "Upfront",
  MILESTONES: "Milestones",
}

export const TX_LABEL: Record<string, string> = {
  ESCROW_FUND: "Escrow funded",
  BRAND_FEE: "Platform fee",
  PROCESSING_FEE: "Processing fee",
  RELEASE: "Released to creator",
  CREATOR_FEE: "Creator fee (withheld)",
  REFUND: "Refund to you",
}

export const NICHES = ["fashion", "beauty", "fitness", "tech", "food", "travel", "finance", "gaming", "education", "family", "lifestyle"]
export const PLATFORMS = ["instagram", "youtube", "linkedin", "tiktok", "x"]

export const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  x: "X",
}

export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

export type RateItem = { deliverable: string; price: number }
export type PlatformStat = { platform: string; handle?: string; followers: number; engagementRate: number; avgViews?: number }

export function minRate(rateCard: unknown): number | null {
  const prices = json<RateItem[]>(rateCard, [])
    .map((r) => r.price)
    .filter((p) => typeof p === "number" && p > 0)
  return prices.length ? Math.min(...prices) : null
}

type DealLike = {
  status: string
  awaitingParty: string
  brandSignedAt: Date | null
  completedAt?: Date | null
  milestones?: { status: string }[]
}

/** What happens next on a deal, and whether the brand is the one who has to act. */
export function nextStep(d: DealLike): { text: string; yourMove: boolean } {
  const submitted = d.milestones?.some((m) => m.status === "SUBMITTED")
  switch (d.status) {
    case "OFFER_SENT":
      return d.awaitingParty === "BRAND" ? { text: "Respond to counter-offer", yourMove: true } : { text: "Waiting on creator's response", yourMove: false }
    case "CONTRACT_PENDING":
      return d.brandSignedAt ? { text: "Waiting on creator's signature", yourMove: false } : { text: "Sign the contract", yourMove: true }
    case "CONTRACT_SIGNED":
      return { text: "Fund escrow to kick off", yourMove: true }
    case "FUNDED":
      return submitted ? { text: "Review submitted work", yourMove: true } : { text: "Creator is starting work", yourMove: false }
    case "IN_PROGRESS":
      return submitted ? { text: "Review submitted work", yourMove: true } : { text: "Creator is delivering", yourMove: false }
    case "COMPLETED":
      return { text: "Wrapped up — leave a review", yourMove: false }
    case "DISPUTED":
      return { text: "hustl. is reviewing the dispute", yourMove: false }
    default:
      return { text: "No further action", yourMove: false }
  }
}

export function monthKeys(count: number, now = new Date()) {
  const keys: { key: string; label: string; start: Date }[] = []
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push({
      key: `${start.getFullYear()}-${start.getMonth()}`,
      label: start.toLocaleDateString("en-IN", { month: "short" }),
      start,
    })
  }
  return keys
}

export const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`
