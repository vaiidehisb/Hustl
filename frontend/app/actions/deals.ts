"use server"
// Deal-room mutations. Every call goes Next.js server → API Gateway → deal /
// payment service; the state machine and permissions are enforced there.
import { revalidatePath } from "next/cache"
import type {
  ContractDTO,
  CounterOfferRequest,
  CreateDisputeRequest,
  CreateFundingIntentResponse,
  CreateOfferRequest,
  CreateReviewRequest,
  DealDetail,
  PaymentIntentDTO,
  SubmitMilestoneRequest,
} from "@hustl/contracts"
import { apiFetch, apiFetchWithMeta } from "@/lib/api/client"
import { friendlyMessage } from "@/lib/api/errors"
import { apiAction, apiActionWithMeta, type ApiActionResult } from "./api-result"

const seg = (v: string) => encodeURIComponent(v)

function refreshDeal(dealId?: string) {
  if (dealId) {
    revalidatePath(`/brand/deals/${dealId}`)
    revalidatePath(`/creator/deals/${dealId}`)
  }
  revalidatePath("/brand/deals")
  revalidatePath("/creator/deals")
}

// ─── Offer & negotiation ─────────────────────────────────────────────────────

/**
 * POST /deals — brand sends an offer.
 * Keeps the legacy `{ ok, error }` result shape used by the brand offer dialog.
 */
export async function createOfferAction(input: CreateOfferRequest): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  try {
    const deal = await apiFetch<DealDetail>("/deals", { method: "POST", body: input })
    refreshDeal(deal.id)
    return { ok: true, data: { id: deal.id } }
  } catch (err) {
    return { ok: false, error: friendlyMessage(err) }
  }
}

/** POST /deals/:id/counter — max 2 counter rounds, enforced server-side. */
export async function counterOfferAction(dealId: string, body: CounterOfferRequest): Promise<ApiActionResult<DealDetail>> {
  const res = await apiAction(() => apiFetch<DealDetail>(`/deals/${seg(dealId)}/counter`, { method: "POST", body }))
  if (res.ok) refreshDeal(dealId)
  return res
}

export async function acceptOfferAction(dealId: string): Promise<ApiActionResult<DealDetail>> {
  const res = await apiAction(() => apiFetch<DealDetail>(`/deals/${seg(dealId)}/accept`, { method: "POST" }))
  if (res.ok) refreshDeal(dealId)
  return res
}

export async function declineOfferAction(dealId: string, reason?: string): Promise<ApiActionResult<DealDetail>> {
  const res = await apiAction(() => apiFetch<DealDetail>(`/deals/${seg(dealId)}/decline`, { method: "POST", body: { reason } }))
  if (res.ok) refreshDeal(dealId)
  return res
}

export async function cancelDealAction(dealId: string, reason?: string): Promise<ApiActionResult<DealDetail>> {
  const res = await apiAction(() => apiFetch<DealDetail>(`/deals/${seg(dealId)}/cancel`, { method: "POST", body: { reason } }))
  if (res.ok) refreshDeal(dealId)
  return res
}

// ─── Contract ────────────────────────────────────────────────────────────────

/** GET /deals/:id/contract — used to re-read `bodyHash` after a 409 "contract changed". */
export async function getContractAction(dealId: string): Promise<ApiActionResult<ContractDTO>> {
  return apiAction(() => apiFetch<ContractDTO>(`/deals/${seg(dealId)}/contract`))
}

/** POST /deals/:id/contract/sign — 409 when the contract changed since it was reviewed. */
export async function signContractAction(dealId: string, signerName: string, bodyHash?: string): Promise<ApiActionResult<DealDetail>> {
  const res = await apiAction(() => apiFetch<DealDetail>(`/deals/${seg(dealId)}/contract/sign`, { method: "POST", body: { signerName, ...(bodyHash ? { bodyHash } : {}) } }))
  if (res.ok) refreshDeal(dealId)
  return res
}

// ─── Escrow funding ──────────────────────────────────────────────────────────

/** POST /payments/deals/:dealId/intent — idempotent per deal; brand only, CONTRACT_SIGNED. */
export async function createFundingIntentAction(dealId: string): Promise<ApiActionResult<CreateFundingIntentResponse>> {
  return apiAction(() => apiFetch<CreateFundingIntentResponse>(`/payments/deals/${seg(dealId)}/intent`, { method: "POST" }))
}

/** POST /payments/intents/:id/confirm-test — test provider only (sandbox). */
export async function confirmTestPaymentAction(dealId: string, intentId: string): Promise<ApiActionResult<PaymentIntentDTO>> {
  const res = await apiAction(() => apiFetch<PaymentIntentDTO>(`/payments/intents/${seg(intentId)}/confirm-test`, { method: "POST" }))
  if (res.ok) refreshDeal(dealId)
  return res
}

/** Called after a provider confirmation so the server component re-reads the deal. */
export async function refreshDealAction(dealId: string): Promise<void> {
  refreshDeal(dealId)
}

// ─── Milestones ──────────────────────────────────────────────────────────────

export async function submitMilestoneAction(dealId: string, milestoneId: string, body: SubmitMilestoneRequest): Promise<ApiActionResult<DealDetail>> {
  const res = await apiAction(() => apiFetch<DealDetail>(`/deals/${seg(dealId)}/milestones/${seg(milestoneId)}/submit`, { method: "POST", body }))
  if (res.ok) refreshDeal(dealId)
  return res
}

/**
 * POST …/approve — releases the payout; the release outcome comes back in `meta.release`.
 * Re-approving an already APPROVED milestone is how a failed release is retried.
 */
export async function approveMilestoneAction(dealId: string, milestoneId: string): Promise<ApiActionResult<DealDetail>> {
  const res = await apiActionWithMeta<DealDetail, Record<string, unknown>>(() =>
    apiFetchWithMeta<DealDetail>(`/deals/${seg(dealId)}/milestones/${seg(milestoneId)}/approve`, { method: "POST" }),
  )
  if (res.ok) refreshDeal(dealId)
  return res
}

export async function requestRevisionAction(dealId: string, milestoneId: string, note: string): Promise<ApiActionResult<DealDetail>> {
  const res = await apiAction(() => apiFetch<DealDetail>(`/deals/${seg(dealId)}/milestones/${seg(milestoneId)}/request-revision`, { method: "POST", body: { note } }))
  if (res.ok) refreshDeal(dealId)
  return res
}

// ─── Disputes & reviews ──────────────────────────────────────────────────────

/** POST /deals/:id/disputes — freezes escrow releases until the trust team resolves it. */
export async function openDisputeAction(dealId: string, body: CreateDisputeRequest): Promise<ApiActionResult<DealDetail>> {
  const res = await apiAction(() => apiFetch<DealDetail>(`/deals/${seg(dealId)}/disputes`, { method: "POST", body }))
  if (res.ok) refreshDeal(dealId)
  return res
}

export async function reviewDealAction(dealId: string, body: CreateReviewRequest): Promise<ApiActionResult<{ id: string }>> {
  const res = await apiAction(() => apiFetch<{ id: string }>(`/deals/${seg(dealId)}/reviews`, { method: "POST", body }))
  if (res.ok) refreshDeal(dealId)
  return res
}
