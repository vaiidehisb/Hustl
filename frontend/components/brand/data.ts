// Server-side data layer for the brand portal. Every read goes through the API
// gateway (`@/lib/api`); nothing here touches a database.


import "server-only"
import type {
  ApplicationDTO,
  BillingProductsResponse,
  BillingSubscriptionResponse,
  ApplicationStatus,
  BrandOverview,
  BriefDTO,
  BriefMatchDTO,
  BriefStatus,
  CampaignAnalytics,
  CreatorSearchResult,
  DealDetail,
  DealPaymentsResponse,
  DealStatus,
  DealSummary,
  LedgerEntryDTO,
  MeResponse,
  OwnBrandProfile,
  PageMeta,
  BrandPaymentSummary,
  SavedCreatorItem,
  SearchMeta,
  VerificationRequestDto,
} from "@hustl/contracts"
import { apiFetch, apiFetchWithMeta, isApiError } from "@/lib/api"

// ─── Result helpers ──────────────────────────────────────────────────────────

/** An ApiError flattened so it can cross the server → client boundary. */
export type SerializedApiError = { name: "ApiError"; status: number; code: string; message: string; details?: unknown }

export type Loaded<T, M = PageMeta> = { ok: true; data: T; meta: M } | { ok: false; error: SerializedApiError }

export function serializeError(err: unknown): SerializedApiError {
  if (isApiError(err)) return { name: "ApiError", status: err.status, code: err.code, message: err.message, details: err.details }
  return { name: "ApiError", status: 500, code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." }
}

/** Runs a read and returns a renderable result instead of throwing. */
export async function load<T, M = PageMeta>(fn: () => Promise<{ data: T; meta?: M }>): Promise<Loaded<T, M>> {
  try {
    const { data, meta } = await fn()
    return { ok: true, data, meta: (meta ?? {}) as M }
  } catch (err) {
    return { ok: false, error: serializeError(err) }
  }
}

const plain = <T>(p: Promise<T>) => p.then((data) => ({ data }))

/** Best-effort read for non-critical extras (badges): never throws. */
export async function soft<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch {
    return null
  }
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export const me = () => apiFetch<MeResponse>("/users/me")

export const brandProfile = () => apiFetch<OwnBrandProfile>("/brands/me")

export const brandOverview = (query?: { from?: string; to?: string }) => apiFetch<BrandOverview>("/analytics/brand/overview", { query })

export const brandCampaigns = (query?: { page?: number; pageSize?: number }) =>
  apiFetchWithMeta<CampaignAnalytics[], PageMeta>("/analytics/brand/campaigns", { query: { pageSize: 50, ...query } })

export const brandDeals = (query?: { status?: DealStatus[] | DealStatus; page?: number; pageSize?: number }) =>
  apiFetchWithMeta<DealSummary[], PageMeta>("/deals", {
    query: { role: "brand", pageSize: 50, ...query, status: Array.isArray(query?.status) ? query.status.join(",") : query?.status },
  })

export const dealDetail = (id: string) => apiFetch<DealDetail>(`/deals/${encodeURIComponent(id)}`)

export const myBriefs = (query?: { status?: BriefStatus; page?: number; pageSize?: number }) =>
  apiFetchWithMeta<BriefDTO[], PageMeta>("/briefs/mine", { query: { pageSize: 50, ...query } })

export const brief = (id: string) => apiFetch<BriefDTO>(`/briefs/${encodeURIComponent(id)}`)

export const briefApplications = (id: string, query?: { status?: ApplicationStatus; page?: number; pageSize?: number }) =>
  apiFetchWithMeta<ApplicationDTO[], PageMeta>(`/briefs/${encodeURIComponent(id)}/applications`, { query: { pageSize: 100, ...query } })

/** AI matches. 503 INTEGRATION_UNAVAILABLE when the AI backend isn't reachable. */
export const briefMatches = (id: string, limit = 20) =>
  apiFetch<{ briefId: string; matches: BriefMatchDTO[] }>(`/briefs/${encodeURIComponent(id)}/matches`, { query: { limit }, timeoutMs: 30_000 })

export type CreatorSearchQuery = {
  q?: string
  niche?: string
  platform?: string
  minFollowers?: number
  maxFollowers?: number
  /** percentage — 3 = 3% (the contract takes percentages here) */
  minEngagement?: number
  location?: string
  verified?: boolean
  available?: boolean
  sort?: string
  page?: number
}

export const searchCreators = (query: CreatorSearchQuery) =>
  apiFetchWithMeta<CreatorSearchResult[], SearchMeta>("/search/creators", { query: { pageSize: 24, ...query } })

export const savedCreators = (query?: { page?: number; pageSize?: number }) =>
  apiFetchWithMeta<SavedCreatorItem[], PageMeta>("/brands/me/saved-creators", { query: { pageSize: 100, ...query } })

export const brandLedger = (query?: { page?: number; pageSize?: number; dealId?: string }) =>
  apiFetchWithMeta<LedgerEntryDTO[], PageMeta>("/payments/me/ledger", { query: { pageSize: 50, ...query } })

export const paymentSummary = () => apiFetch<BrandPaymentSummary>("/payments/me/summary")

export const dealPayments = (dealId: string) => apiFetch<DealPaymentsResponse>(`/payments/deals/${encodeURIComponent(dealId)}`)

export const myVerifications = () => apiFetch<VerificationRequestDto[]>("/verifications/me")
export const billingProducts = () => apiFetch<BillingProductsResponse>("/payments/billing/products")
export const mySubscriptions = () => apiFetch<BillingSubscriptionResponse>("/payments/billing/subscription")

// ─── Loaded (non-throwing) variants used by pages ────────────────────────────

export const loadOverview = (query?: { from?: string; to?: string }) => load(() => plain(brandOverview(query)))
export const loadCampaigns = () => load(() => brandCampaigns())
export const loadDeals = (query?: Parameters<typeof brandDeals>[0]) => load(() => brandDeals(query))
export const loadBriefs = (query?: Parameters<typeof myBriefs>[0]) => load(() => myBriefs(query))
export const loadBrief = (id: string) => load(() => plain(brief(id)))
export const loadApplications = (id: string, query?: Parameters<typeof briefApplications>[1]) => load(() => briefApplications(id, query))
export const loadMatches = (id: string, limit?: number) => load(() => plain(briefMatches(id, limit)))
export const loadSearch = (query: CreatorSearchQuery) => load<CreatorSearchResult[], SearchMeta>(() => searchCreators(query))
export const loadSaved = () => load(() => savedCreators())
export const loadLedger = (query?: Parameters<typeof brandLedger>[0]) => load(() => brandLedger(query))
export const loadPaymentSummary = () => load(() => plain(paymentSummary()))
export const loadBrandProfile = () => load(() => plain(brandProfile()))
export const loadMe = () => load(() => plain(me()))
export const loadVerifications = () => load(() => plain(myVerifications()))

/** Billing reads fail soft: a settings page must still render its profile if billing is down. */
export const loadBillingProducts = (): Promise<BillingProductsResponse | null> => soft(billingProducts)
export const loadBilling = (): Promise<BillingSubscriptionResponse | null> => soft(mySubscriptions)

// ─── Derived counts for the sidebar badges ───────────────────────────────────

/** Deals where the brand is the one who has to act. Never throws. */
export async function countDealsNeedingAction(): Promise<number | null> {
  const res = await soft(() => brandDeals({ pageSize: 100 }))
  if (!res) return null
  return res.data.filter((d) => (d.awaitingParty === "BRAND" && (d.status === "OFFER_SENT" || d.status === "NEGOTIATING")) || d.status === "AGREED" || d.status === "CONTRACT_SIGNED").length
}

/** Applications still sitting in APPLIED across the brand's live briefs. Never throws. */
export async function countNewApplications(): Promise<number | null> {
  const briefs = await soft(() => myBriefs({ status: "PUBLISHED", pageSize: 20 }))
  if (!briefs) return null
  const counts = await Promise.all(
    briefs.data.slice(0, 12).map((b) => soft(() => briefApplications(b.id, { status: "APPLIED", pageSize: 1 }).then((r) => r.meta.total ?? 0))),
  )
  if (counts.every((c) => c === null)) return null
  return counts.reduce<number>((s, c) => s + (c ?? 0), 0)
}
