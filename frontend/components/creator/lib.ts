// Creator-portal helpers. Pure (no server-only imports, no Prisma) so both
// server pages and client components can use them. Types come from the API
// contracts; numbers are never invented here.

import type { ApplicationStatus, CreatorScoreDto, DealSummary, DealUiAction, ProfileCompletion, SocialPlatform } from "@hustl/contracts"
import { isApiError } from "@/lib/api/errors"
import type { Tone } from "@/lib/deals/machine"

export const NICHES = ["fashion", "beauty", "fitness", "tech", "food", "travel", "finance", "gaming", "education", "family", "lifestyle"] as const
export type Niche = (typeof NICHES)[number]

export const SOCIAL_PLATFORMS = ["INSTAGRAM", "YOUTUBE", "TIKTOK", "LINKEDIN", "X"] as const

export const HANDLE_RE = /^[a-z0-9._]{3,30}$/
export const normalizeHandle = (h: string) =>
  String(h ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()

/** Mirrors `createApplicationRequest` in the contracts. */
export const PITCH_MIN = 20
export const PITCH_MAX = 5000
export const HEADLINE_MAX = 120
export const BIO_MAX = 2000
export const NICHE_MAX = 5
export const MIN_RATE = 1

const PLATFORM_LABELS: Record<string, string> = {
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube",
  TIKTOK: "TikTok",
  LINKEDIN: "LinkedIn",
  X: "X",
}
export const platformLabel = (p: string) => PLATFORM_LABELS[p?.toUpperCase()] ?? p
export const nicheLabel = (n: string) => (n ? n.charAt(0).toUpperCase() + n.slice(1) : n)

const MODE_LABELS: Record<string, string> = {
  MILESTONES: "Milestone payments",
  UPFRONT: "Paid upfront",
  COMPLETION: "Paid on completion",
}
export const paymentModeLabel = (m: string) => MODE_LABELS[m] ?? m

export type Deliverable = { type: string; quantity: number }
export const deliverablesText = (d: Deliverable[]) => d.map((x) => `${x.quantity} × ${x.type}`).join(", ")

// ─── Dates ───────────────────────────────────────────────────────────────────

export function daysUntil(date: Date | string) {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000)
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

/** "2026-03" → "Mar" (analytics months are UTC "YYYY-MM" buckets). */
export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number)
  if (!y || !m) return month
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })
}

export function audienceTier(followers: number) {
  if (followers < 10_000) return { name: "Nano", range: "under 10K" }
  if (followers < 100_000) return { name: "Micro", range: "10K–100K" }
  if (followers < 1_000_000) return { name: "Mid-tier", range: "100K–1M" }
  return { name: "Macro", range: "1M+" }
}

// ─── Profile strength (from GET /users/me `profileCompletion`) ───────────────

export type ChecklistItem = { key: string; label: string; hint: string; done: boolean; href: string }

const COMPLETION_COPY: Record<string, { label: string; hint: string; href: string }> = {
  headline: { label: "Add a headline", hint: "One line on who you create for.", href: "/creator/profile#basics" },
  bio: { label: "Write a bio", hint: "2–3 lines on what you're known for.", href: "/creator/profile#bio" },
  location: { label: "Add your location", hint: "Brands filter briefs by city.", href: "/creator/profile#basics" },
  niches: { label: "Pick your niches", hint: "Matching starts here — choose up to 5.", href: "/creator/profile#niches" },
  rateCard: { label: "Add a rate card", hint: "Clear pricing gets you shortlisted first.", href: "/creator/profile#rates" },
  portfolio: { label: "Show past work", hint: "Link 2–3 of your best collaborations.", href: "/creator/profile#portfolio" },
  avatar: { label: "Add a profile photo", hint: "Profiles with a face get more replies.", href: "/creator/profile#basics" },
  socialAccount: { label: "Connect a social account", hint: "Your reach and engagement feed every score.", href: "/creator/settings" },
  role: { label: "Finish choosing your role", hint: "Pick creator to unlock the portal.", href: "/onboarding" },
}

/** Turns the API's `profileCompletion` into the dashboard checklist. Done items come first from what is *not* missing. */
export function completionChecklist(completion: ProfileCompletion): ChecklistItem[] {
  const missing = new Set<string>(completion.missing)
  return Object.entries(COMPLETION_COPY)
    .filter(([key]) => key !== "role" || missing.has("role"))
    .map(([key, copy]) => ({ key, ...copy, done: !missing.has(key) }))
}

// ─── Deals ───────────────────────────────────────────────────────────────────

export const ACTIVE_DEAL_STATUSES = ["OFFER_SENT", "NEGOTIATING", "AGREED", "CONTRACT_SIGNED", "FUNDED", "IN_PROGRESS", "DISPUTED"] as const

export const isInboundOffer = (d: DealSummary) => (d.status === "OFFER_SENT" || d.status === "NEGOTIATING") && d.awaitingParty === "CREATOR"

/**
 * Plain-language "what happens next" for the creator. `actions` are the
 * server's `allowedActions` for this deal when we have the detail loaded.
 */
export function creatorNextStep(deal: DealSummary, actions: DealUiAction[] = []): { text: string; tone: Tone; yourMove: boolean } {
  const yours = deal.awaitingParty === "CREATOR"
  switch (deal.status) {
    case "OFFER_SENT":
    case "NEGOTIATING":
      return yours
        ? { text: actions.includes("COUNTER") ? "Review the offer — accept, counter or decline" : "Review the offer — accept or decline", tone: "brand", yourMove: true }
        : { text: "Waiting for the brand to respond to your counter", tone: "neutral", yourMove: false }
    case "AGREED":
      return actions.includes("SIGN")
        ? { text: "Sign the contract to lock in this deal", tone: "warning", yourMove: true }
        : { text: "Terms agreed — the contract is being prepared", tone: "neutral", yourMove: false }
    case "CONTRACT_SIGNED":
      return { text: "Waiting for the brand to fund escrow — don't start work yet", tone: "neutral", yourMove: false }
    case "FUNDED":
      return { text: "Escrow funded — you can start work", tone: "brand", yourMove: true }
    case "IN_PROGRESS":
      return { text: "Work in progress — submit milestones as you finish them", tone: "brand", yourMove: true }
    case "DISPUTED":
      return { text: "Dispute under review — payouts are frozen until it's resolved", tone: "danger", yourMove: false }
    case "COMPLETED":
      return { text: actions.includes("REVIEW") ? "Completed — leave the brand a review" : "Completed and paid out", tone: "success", yourMove: actions.includes("REVIEW") }
    default:
      return { text: "Cancelled", tone: "neutral", yourMove: false }
  }
}

// ─── Scores & signals ────────────────────────────────────────────────────────

export type SignalComponent = { name: string; weight: number; normalized: number; status?: string; value?: unknown; detail?: string }
export type SignalGroup = { components: Record<string, SignalComponent>; data_coverage?: number }

/** `signals` on a creator score: `{ trust: { components, data_coverage }, … }`. */
export function signalGroup(signals: Record<string, unknown> | undefined, key: string): SignalComponent[] {
  const group = signals?.[key] as SignalGroup | undefined
  const components = group?.components
  if (!components || typeof components !== "object") return []
  return Object.values(components).filter((c): c is SignalComponent => !!c && typeof c === "object" && typeof (c as SignalComponent).name === "string")
}

export const isInsufficient = (s: SignalComponent) => s.status === "insufficient_data"

export const signalLabel = (name: string) =>
  name
    .replace(/_/g, " ")
    .replace(/\bhours\b/, "(hours)")
    .replace(/^./, (c) => c.toUpperCase())

export const scoreGroups = (score: CreatorScoreDto | null) =>
  score
    ? ([
        { key: "trust", title: "Trust", score: score.trustScore, what: "How safe brands feel working with you." },
        { key: "reliability", title: "Reliability", score: score.reliabilityScore, what: "Whether you deliver on time, first time." },
        { key: "niche_authority", title: "Niche authority", score: score.nicheAuthority, what: "How much your audience cares about your niche." },
      ] as const)
    : []

// ─── Applications ────────────────────────────────────────────────────────────

export const APPLICATION_TABS = {
  active: { label: "Active", statuses: ["APPLIED", "SHORTLISTED"] },
  offers: { label: "Offers", statuses: ["OFFERED"] },
  closed: { label: "Closed", statuses: ["REJECTED", "WITHDRAWN"] },
} as const satisfies Record<string, { label: string; statuses: readonly ApplicationStatus[] }>
export type ApplicationTab = keyof typeof APPLICATION_TABS

export const canWithdraw = (status: ApplicationStatus) => status === "APPLIED" || status === "SHORTLISTED"

// ─── Errors ──────────────────────────────────────────────────────────────────

/** Server components can't hand an Error instance to a client component — send this instead. */
export type SerializedError = { status: number; code: string; message: string }

export function toSerializedError(err: unknown): SerializedError {
  if (isApiError(err)) return { status: err.status, code: err.code, message: err.message }
  return { status: 500, code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." }
}

// ─── Social ──────────────────────────────────────────────────────────────────

export const SELF_REPORTED_LABEL = "Self-reported · unverified"

export const platformOrder = (p: SocialPlatform) => SOCIAL_PLATFORMS.indexOf(p)
