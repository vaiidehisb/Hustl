"use server"

// Creator-portal mutations. Every one calls the gateway through `lib/api`;
// failures come back as a serialisable `{ code, message, fieldErrors? }` the
// forms map onto fields (422) or show as a toast (409 / 503).

import { revalidatePath } from "next/cache"
import type {
  ApplicationDTO,
  ApplyMeta,
  CreateVerificationRequest,
  OnboardingLinkResponse,
  OwnCreatorProfile,
  PhylloSdkToken,
  SelfReportedAccountInput,
  SocialAccountDto,
  SocialSyncResult,
  UpdateCreatorProfileRequest,
  VerificationRequestDto,
} from "@hustl/contracts"
import { apiFetch, apiFetchWithMeta, isApiError, friendlyMessage } from "@/lib/api"

export type ActionError = { code: string; message: string; fieldErrors?: Record<string, string> }
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: ActionError }

function toActionError(err: unknown): ActionError {
  if (!isApiError(err)) return { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." }
  if (err.status === 422) {
    const fieldErrors = err.fieldErrors
    const hasFields = Object.keys(fieldErrors).length > 0
    return { code: err.code, message: hasFields ? "Please fix the highlighted fields." : err.message, ...(hasFields ? { fieldErrors } : {}) }
  }
  const field = err.status === 409 ? err.field : undefined
  return { code: err.code, message: friendlyMessage(err), ...(field ? { fieldErrors: { [field]: err.message } } : {}) }
}

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (err) {
    if (err instanceof Error && /NEXT_REDIRECT/.test(err.message)) throw err
    return { ok: false, error: toActionError(err) }
  }
}

const refreshPortal = () => revalidatePath("/creator", "layout")

// ─── Applications ────────────────────────────────────────────────────────────

export async function applyToBriefAction(briefId: string, input: { pitch: string; proposedRate: number }) {
  return run(async () => {
    const { data, meta } = await apiFetchWithMeta<ApplicationDTO, ApplyMeta>(`/briefs/${encodeURIComponent(briefId)}/applications`, {
      method: "POST",
      body: { pitch: input.pitch.trim(), proposedRate: Math.round(Number(input.proposedRate)) },
      // Scoring is synchronous for the first applications on a brief.
      timeoutMs: 30_000,
    })
    refreshPortal()
    return { application: data, aiScoring: meta?.aiScoring ?? "queued" }
  })
}

export async function withdrawApplicationAction(applicationId: string) {
  return run(async () => {
    const application = await apiFetch<ApplicationDTO>(`/applications/${encodeURIComponent(applicationId)}/withdraw`, { method: "POST" })
    refreshPortal()
    return application
  })
}

// ─── Profile ─────────────────────────────────────────────────────────────────

export async function saveProfileAction(input: UpdateCreatorProfileRequest) {
  return run(async () => {
    const profile = await apiFetch<OwnCreatorProfile>("/creators/me", { method: "PUT", body: input })
    refreshPortal()
    revalidatePath(`/creators/${profile.handle}`)
    return profile
  })
}

// ─── Social accounts ─────────────────────────────────────────────────────────

/** `engagementRate` is a percentage here (4.2 = 4.2%); the service stores a fraction. */
export async function saveSelfReportedAccountAction(input: SelfReportedAccountInput) {
  return run(async () => {
    const account = await apiFetch<SocialAccountDto>("/social/accounts/self-reported", { method: "POST", body: input })
    refreshPortal()
    return account
  })
}

export async function deleteSocialAccountAction(id: string) {
  return run(async () => {
    const res = await apiFetch<{ deleted: true }>(`/social/accounts/${encodeURIComponent(id)}`, { method: "DELETE" })
    refreshPortal()
    return res
  })
}

/** Phyllo refresh — 503 INTEGRATION_UNAVAILABLE when Phyllo keys aren't set. */
export async function syncSocialsAction() {
  return run(async () => {
    const res = await apiFetch<SocialSyncResult>("/social/accounts/me/sync", { method: "POST", timeoutMs: 30_000 })
    refreshPortal()
    return res
  })
}

/** Token for Phyllo Connect — 503 INTEGRATION_UNAVAILABLE without PHYLLO_CLIENT_ID/SECRET. */
export async function phylloSdkTokenAction() {
  return run(() => apiFetch<PhylloSdkToken>("/social/phyllo/sdk-token", { method: "POST" }))
}

// ─── Verification ────────────────────────────────────────────────────────────

export async function requestVerificationAction(input: CreateVerificationRequest) {
  return run(async () => {
    const request = await apiFetch<VerificationRequestDto>("/verifications", { method: "POST", body: input })
    refreshPortal()
    return request
  })
}

// ─── Payouts ─────────────────────────────────────────────────────────────────

/** Provider onboarding link — 503 INTEGRATION_UNAVAILABLE when Stripe/Razorpay keys are missing. */
export async function payoutOnboardingLinkAction(returnUrl?: string) {
  return run(async () => {
    const res = await apiFetch<OnboardingLinkResponse>("/payments/payout-account/onboarding-link", {
      method: "POST",
      body: returnUrl ? { returnUrl, refreshUrl: returnUrl } : {},
      timeoutMs: 20_000,
    })
    refreshPortal()
    return res
  })
}
