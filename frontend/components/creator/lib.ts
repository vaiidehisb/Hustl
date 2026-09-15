// Creator-portal helpers. Pure (no server-only imports) so both server pages
// and client components can use them.

import type { Tone } from "@/lib/deals/machine"

export const NICHES = [
  "fashion",
  "beauty",
  "fitness",
  "tech",
  "food",
  "travel",
  "finance",
  "gaming",
  "education",
  "family",
  "lifestyle",
] as const

export const SOCIAL_PLATFORMS = ["instagram", "youtube", "linkedin", "tiktok"] as const
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]

export const HANDLE_RE = /^[a-z0-9._]{3,30}$/
export const normalizeHandle = (h: string) => String(h ?? "").trim().replace(/^@+/, "").toLowerCase()

export const PITCH_MIN = 80
export const PITCH_MAX = 1500
export const HEADLINE_MAX = 100
export const BIO_MAX = 1000
export const NICHE_MAX = 5

export type SocialAccount = { platform: string; handle: string; followers: number; engagementRate: number; avgViews: number }
export type RateCardRow = { deliverable: string; price: number }
export type PortfolioRow = { title: string; url: string; brand?: string }
export type Deliverable = { type: string; quantity: number }

export type ProfileInput = {
  handle: string
  headline: string
  bio: string
  location: string
  niches: string[]
  languages: string[]
  available: boolean
  rateCard: RateCardRow[]
  portfolio: PortfolioRow[]
}

export type SocialInput = {
  platform: string
  handle: string
  followers: number
  engagementPct: number
  avgViews: number
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  x: "X",
}
export const platformLabel = (p: string) => PLATFORM_LABELS[p.toLowerCase()] ?? p.charAt(0).toUpperCase() + p.slice(1)
export const nicheLabel = (n: string) => (n ? n.charAt(0).toUpperCase() + n.slice(1) : n)

const MODE_LABELS: Record<string, string> = {
  MILESTONES: "Milestone payments",
  UPFRONT: "Paid upfront",
  COMPLETION: "Paid on completion",
}
export const paymentModeLabel = (m: string) => MODE_LABELS[m] ?? m

export const deliverablesText = (d: Deliverable[]) => d.map((x) => `${x.quantity} × ${x.type}`).join(", ")

export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`

/** The last `n` calendar months, oldest first. */
export function lastMonths(n: number, now = new Date()) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1)
    return { key: monthKey(d), label: d.toLocaleDateString("en-IN", { month: "short" }), start: d }
  })
}

export function daysUntil(date: Date | string) {
  const ms = new Date(date).getTime() - Date.now()
  return Math.ceil(ms / 86_400_000)
}

export function dueLabel(date: Date | string | null | undefined): { text: string; tone: Tone } | null {
  if (!date) return null
  const d = daysUntil(date)
  if (d < 0) return { text: `Overdue by ${-d}d`, tone: "danger" }
  if (d === 0) return { text: "Due today", tone: "danger" }
  if (d === 1) return { text: "Due tomorrow", tone: "warning" }
  if (d <= 3) return { text: `Due in ${d} days`, tone: "warning" }
  return { text: `Due ${new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`, tone: "neutral" }
}

export function deadlineLabel(date: Date | string | null | undefined): { text: string; tone: Tone } | null {
  if (!date) return null
  const d = daysUntil(date)
  if (d <= 0) return { text: "Closes today", tone: "danger" }
  if (d <= 3) return { text: `${d} day${d === 1 ? "" : "s"} left`, tone: "warning" }
  return { text: `Apply by ${new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`, tone: "neutral" }
}

export function audienceTier(followers: number) {
  if (followers < 10_000) return { name: "Nano", range: "under 10K" }
  if (followers < 100_000) return { name: "Micro", range: "10K–100K" }
  if (followers < 1_000_000) return { name: "Mid-tier", range: "100K–1M" }
  return { name: "Macro", range: "1M+" }
}

export type ChecklistItem = { key: string; label: string; hint: string; done: boolean; href: string }

export function profileChecklist(
  c: { bio: string; niches: unknown; rateCard: unknown; portfolio: unknown; socialsConnected: boolean; verified: boolean },
  kycVerified = false,
): ChecklistItem[] {
  const arr = (v: unknown) => (Array.isArray(v) ? v : [])
  return [
    { key: "bio", label: "Write a bio", hint: "2–3 lines on who you create for and what you're known for.", done: c.bio.trim().length >= 40, href: "/creator/profile#bio" },
    { key: "niches", label: "Pick your niches", hint: "Matching starts here — choose up to 5.", done: arr(c.niches).length > 0, href: "/creator/profile#niches" },
    { key: "rate", label: "Add a rate card", hint: "Brands shortlist creators with clear pricing first.", done: arr(c.rateCard).length > 0, href: "/creator/profile#rates" },
    { key: "portfolio", label: "Show past work", hint: "Link 2–3 of your best brand collaborations or posts.", done: arr(c.portfolio).length > 0, href: "/creator/profile#portfolio" },
    { key: "socials", label: "Connect socials", hint: "Synced numbers unlock higher match scores.", done: c.socialsConnected, href: "/creator/settings" },
    { key: "verified", label: "Get verified", hint: "Granted after socials are connected and KYC is reviewed.", done: c.verified || kycVerified, href: "/creator/settings" },
  ]
}

type NextStepDeal = {
  status: string
  awaitingParty: string
  creatorSignedAt: Date | null
  milestones: { title: string; status: string; dueDate: Date | null; order: number }[]
}

/** Plain-language "what happens next" for a creator, per deal. */
export function creatorNextStep(deal: NextStepDeal): { text: string; tone: Tone; yourMove: boolean } {
  switch (deal.status) {
    case "OFFER_SENT":
      return deal.awaitingParty === "CREATOR"
        ? { text: "Review the offer — accept, counter or decline", tone: "brand", yourMove: true }
        : { text: "Waiting for the brand to respond to your counter", tone: "neutral", yourMove: false }
    case "CONTRACT_PENDING":
      return deal.creatorSignedAt
        ? { text: "You've signed — waiting for the brand's signature", tone: "neutral", yourMove: false }
        : { text: "Sign the contract to lock in this deal", tone: "warning", yourMove: true }
    case "CONTRACT_SIGNED":
      return { text: "Waiting for the brand to fund escrow — don't start work yet", tone: "neutral", yourMove: false }
    case "FUNDED":
    case "IN_PROGRESS": {
      const next = [...deal.milestones].sort((a, b) => a.order - b.order).find((m) => !["APPROVED", "RELEASED"].includes(m.status))
      if (!next) return { text: "All milestones approved — payout on its way", tone: "success", yourMove: false }
      if (next.status === "REVISION_REQUESTED") return { text: `Revision requested on “${next.title}”`, tone: "danger", yourMove: true }
      if (next.status === "SUBMITTED") return { text: `“${next.title}” is with the brand for approval`, tone: "neutral", yourMove: false }
      if (next.status === "DISPUTED") return { text: `“${next.title}” is under dispute`, tone: "danger", yourMove: false }
      const due = dueLabel(next.dueDate)
      return { text: `Deliver “${next.title}”${due ? ` · ${due.text.toLowerCase()}` : ""}`, tone: due?.tone === "danger" ? "danger" : "brand", yourMove: true }
    }
    case "DISPUTED":
      return { text: "Dispute under review — payouts are frozen until resolved", tone: "danger", yourMove: false }
    case "COMPLETED":
      return { text: "Completed and paid out", tone: "success", yourMove: false }
    default:
      return { text: "Cancelled", tone: "neutral", yourMove: false }
  }
}
