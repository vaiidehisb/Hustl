import "server-only"
// Every creator-portal read goes through the gateway (Next server → :4000).
// Types are the real service contracts; nothing here touches the database.

import type {
  ApplicationDTO,
  ApplicationStatus,
  BrandPublicProfile,
  BriefDTO,
  CreatorMetrics,
  CreatorOverview,
  CreatorPaymentSummary,
  DealDetail,
  DealSummary,
  MeResponse,
  OwnCreatorProfile,
  PageMeta,
  PayoutAccountDTO,
  PayoutDTO,
  SocialAccountDto,
  SocialPlatform,
  SocialProvidersStatus,
  VerificationRequestDto,
} from "@hustl/contracts"
import { apiFetch, apiFetchWithMeta } from "@/lib/api"
import { toSerializedError, type SerializedError } from "@/components/creator/lib"

/** GET /briefs/:id/fit — the AI application-scoring preview for the signed-in creator. */
export type BriefFit = { briefId: string; creatorId: string; matchScore: number; matchReasons: string[]; disqualifiers: string[]; modelVersion: string | null }

export type Loaded<T> = { ok: true; data: T } | { ok: false; error: SerializedError }

/** Fail-soft wrapper: a section that can't load renders an error state instead of blowing up the page. */
export async function load<T>(fn: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (err) {
    return { ok: false, error: toSerializedError(err) }
  }
}

/** Optional extra (badges, fit scores): null when it fails, never throws. */
export async function soft<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch {
    return null
  }
}

export type Page<T> = { items: T[]; meta: PageMeta }

const paged = async <T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<Page<T>> => {
  const { data, meta } = await apiFetchWithMeta<T[], PageMeta>(path, { query })
  return { items: data, meta: meta ?? {} }
}

// ─── Me & profile ────────────────────────────────────────────────────────────

export const getMe = () => apiFetch<MeResponse>("/users/me")
export const getCreatorProfile = () => apiFetch<OwnCreatorProfile>("/creators/me")
export const getVerifications = () => apiFetch<VerificationRequestDto[]>("/verifications/me")

// ─── Briefs & applications ───────────────────────────────────────────────────

export type OpenBriefsFilters = { q?: string; niche?: string; platform?: SocialPlatform; minBudget?: number; page?: number; pageSize?: number }

export const getOpenBriefs = (filters: OpenBriefsFilters = {}) => paged<BriefDTO>("/briefs/open", filters)
export const getBrief = (id: string) => apiFetch<BriefDTO>(`/briefs/${encodeURIComponent(id)}`)
/** AI call — 15s upstream; only ask for it where the score is actually shown. */
export const getBriefFit = (id: string) => apiFetch<BriefFit>(`/briefs/${encodeURIComponent(id)}/fit`, { timeoutMs: 20_000 })
export const getBrandProfile = (slug: string) => apiFetch<BrandPublicProfile>(`/brands/${encodeURIComponent(slug)}`)
export const getMyApplications = (query: { status?: ApplicationStatus; page?: number; pageSize?: number } = {}) => paged<ApplicationDTO>("/applications/mine", query)

// ─── Deals ───────────────────────────────────────────────────────────────────

/** GET /deals?role=creator — the service expects the lowercase role. */
export const getMyDeals = (query: { status?: string; page?: number; pageSize?: number } = {}) => paged<DealSummary>("/deals", { role: "creator", ...query })
export const getDeal = (id: string) => apiFetch<DealDetail>(`/deals/${encodeURIComponent(id)}`)

const NEEDS_WORK: string[] = ["FUNDED", "IN_PROGRESS", "AGREED", "DISPUTED"]

/**
 * Sidebar badges: offers awaiting the creator, and milestones the brand sent
 * back for revision. Never throws — the layout renders without badges instead.
 */
export async function getCreatorBadges(): Promise<{ offers: number; revisions: number }> {
  const page = await soft(() => getMyDeals({ pageSize: 100 }))
  if (!page) return { offers: 0, revisions: 0 }
  const offers = page.items.filter((d) => (d.status === "OFFER_SENT" || d.status === "NEGOTIATING") && d.awaitingParty === "CREATOR").length
  const revisions = page.items
    .filter((d) => NEEDS_WORK.includes(d.status))
    .reduce((n, d) => n + d.milestoneRollup.revisionRequested, 0)
  return { offers, revisions }
}

// ─── Money ───────────────────────────────────────────────────────────────────

export const getPayouts = (query: { page?: number; pageSize?: number } = {}) => paged<PayoutDTO>("/payments/me/payouts", query)
export const getPaymentSummary = () => apiFetch<CreatorPaymentSummary>("/payments/me/summary")
export const getPayoutAccount = () => apiFetch<PayoutAccountDTO>("/payments/payout-account")

// ─── Analytics & social ──────────────────────────────────────────────────────

export const getCreatorOverview = () => apiFetch<CreatorOverview>("/analytics/creator/overview")
export const getCreatorMetrics = (creatorId: string) => apiFetch<CreatorMetrics>(`/social/creators/${encodeURIComponent(creatorId)}/metrics`)
export const getSocialProviders = () => apiFetch<SocialProvidersStatus>("/social/providers")
export const getSocialAccounts = () => apiFetch<SocialAccountDto[]>("/social/accounts/me")
