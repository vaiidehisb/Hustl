"use server"

// Brand portal mutations. Every action calls the API gateway through
// `@/lib/api` and returns a serialisable result:
//   { ok: true, data } | { ok: false, error: { code, message, fieldErrors? } }

import { revalidatePath } from "next/cache"
import type { ZodSchema } from "zod"
import {
  createBriefRequest,
  createOfferRequest,
  createVerificationRequest,
  updateBrandProfileRequest,
  updateBriefRequest,
  type ApplicationDTO,
  type BriefDTO,
  type CreateBriefRequest,
  type CreateOfferRequest,
  type DealDetail,
  type OwnBrandProfile,
  type SavedCreatorState,
  type UpdateBrandProfileRequest,
  type UpdateBriefRequest,
  type VerificationRequestDto,
} from "@hustl/contracts"
import { apiFetch } from "@/lib/api"
import { toFormError, zodFieldErrors } from "@/lib/api/form-errors"
import type { ParsedBriefResult } from "@/components/brand/helpers"

export type ActionError = { code: string; message: string; fieldErrors?: Record<string, string> }
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: ActionError }

const fail = (code: string, message: string, fieldErrors?: Record<string, string>): ActionResult<never> => ({ ok: false, error: { code, message, fieldErrors } })

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (err) {
    if (err instanceof Error && /NEXT_REDIRECT|NEXT_NOT_FOUND/.test(err.message)) throw err
    const e = toFormError(err)
    return { ok: false, error: { code: e.code, message: e.error, fieldErrors: e.fieldErrors } }
  }
}

/** Validates with the contract schema first so obvious mistakes never leave the server. */
function check<T>(schema: ZodSchema<T>, input: unknown): { ok: true; value: T } | { ok: false; result: ActionResult<never> } {
  const parsed = schema.safeParse(input)
  if (parsed.success) return { ok: true, value: parsed.data }
  return { ok: false, result: fail("VALIDATION_ERROR", "Please fix the highlighted fields.", zodFieldErrors(parsed.error)) }
}

const refreshBrand = () => revalidatePath("/brand", "layout")

// ─── Briefs ──────────────────────────────────────────────────────────────────

export async function parseBriefAction(text: string): Promise<ActionResult<ParsedBriefResult>> {
  if (text.trim().length < 20) return fail("VALIDATION_ERROR", "Describe the campaign in a sentence or two first.", { text: "Add at least 20 characters." })
  return run(() => apiFetch<ParsedBriefResult>("/briefs/parse", { method: "POST", body: { text: text.trim().slice(0, 20_000) }, timeoutMs: 40_000 }))
}

export async function createBriefAction(input: CreateBriefRequest, publish = false): Promise<ActionResult<{ id: string; status: string }>> {
  const v = check(createBriefRequest, input)
  if (!v.ok) return v.result
  return run(async () => {
    const brief = await apiFetch<BriefDTO>("/briefs", { method: "POST", body: v.value })
    const final = publish ? await apiFetch<BriefDTO>(`/briefs/${brief.id}/publish`, { method: "POST", timeoutMs: 30_000 }) : brief
    refreshBrand()
    return { id: final.id, status: final.status }
  })
}

export async function updateBriefAction(briefId: string, input: UpdateBriefRequest, publish = false): Promise<ActionResult<{ id: string; status: string }>> {
  const v = check(updateBriefRequest, input)
  if (!v.ok) return v.result
  return run(async () => {
    const brief = await apiFetch<BriefDTO>(`/briefs/${briefId}`, { method: "PATCH", body: v.value })
    const final = publish ? await apiFetch<BriefDTO>(`/briefs/${briefId}/publish`, { method: "POST", timeoutMs: 30_000 }) : brief
    refreshBrand()
    revalidatePath(`/brand/briefs/${briefId}`)
    return { id: final.id, status: final.status }
  })
}

export async function publishBriefAction(briefId: string): Promise<ActionResult<{ id: string; status: string }>> {
  return run(async () => {
    const brief = await apiFetch<BriefDTO>(`/briefs/${briefId}/publish`, { method: "POST", timeoutMs: 30_000 })
    refreshBrand()
    revalidatePath(`/brand/briefs/${briefId}`)
    return { id: brief.id, status: brief.status }
  })
}

export async function closeBriefAction(briefId: string): Promise<ActionResult<{ id: string; status: string }>> {
  return run(async () => {
    const brief = await apiFetch<BriefDTO>(`/briefs/${briefId}/close`, { method: "POST" })
    refreshBrand()
    revalidatePath(`/brand/briefs/${briefId}`)
    return { id: brief.id, status: brief.status }
  })
}

export async function deleteBriefAction(briefId: string): Promise<ActionResult<{ deleted: true }>> {
  return run(async () => {
    const res = await apiFetch<{ deleted: true }>(`/briefs/${briefId}`, { method: "DELETE" })
    refreshBrand()
    return res
  })
}

// ─── Applications ────────────────────────────────────────────────────────────

export async function setApplicationStatusAction(applicationId: string, status: "SHORTLISTED" | "REJECTED"): Promise<ActionResult<ApplicationDTO>> {
  return run(async () => {
    const app = await apiFetch<ApplicationDTO>(`/applications/${applicationId}/status`, { method: "PATCH", body: { status } })
    refreshBrand()
    revalidatePath(`/brand/briefs/${app.briefId}`)
    return app
  })
}

// ─── Creators ────────────────────────────────────────────────────────────────

export async function toggleSaveCreatorAction(creatorId: string, saved: boolean): Promise<ActionResult<SavedCreatorState>> {
  return run(async () => {
    const res = await apiFetch<SavedCreatorState>(`/brands/me/saved-creators/${creatorId}`, { method: saved ? "PUT" : "DELETE" })
    revalidatePath("/brand/discover")
    return res
  })
}

// ─── Offers ──────────────────────────────────────────────────────────────────

export async function sendOfferAction(input: CreateOfferRequest): Promise<ActionResult<{ id: string }>> {
  const v = check(createOfferRequest, input)
  if (!v.ok) return v.result
  return run(async () => {
    const deal = await apiFetch<DealDetail>("/deals", { method: "POST", body: v.value })
    refreshBrand()
    return { id: deal.id }
  })
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function updateBrandProfileAction(input: UpdateBrandProfileRequest): Promise<ActionResult<OwnBrandProfile>> {
  const v = check(updateBrandProfileRequest, input)
  if (!v.ok) return v.result
  return run(async () => {
    const profile = await apiFetch<OwnBrandProfile>("/brands/me", { method: "PUT", body: v.value })
    refreshBrand()
    return profile
  })
}

/** Files a real verification request — an admin reviews it, nothing is verified here. */
export async function requestVerificationAction(details: Record<string, string>): Promise<ActionResult<VerificationRequestDto>> {
  const cleaned = Object.fromEntries(Object.entries(details).filter(([, v]) => v?.trim()).map(([k, v]) => [k, v.trim()]))
  if (!cleaned.legalName) return fail("VALIDATION_ERROR", "Please fix the highlighted fields.", { legalName: "Enter the registered legal name." })
  const v = check(createVerificationRequest, { type: "BRAND_BUSINESS", details: cleaned, documentIds: [] })
  if (!v.ok) return v.result
  return run(async () => {
    const request = await apiFetch<VerificationRequestDto>("/verifications", { method: "POST", body: v.value })
    refreshBrand()
    revalidatePath("/brand/settings")
    return request
  })
}
