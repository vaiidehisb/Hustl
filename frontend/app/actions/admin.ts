"use server"
// Admin console mutations. Authorisation is the services' job (requireRole("ADMIN"));
// the layout also gates the route.
import { revalidatePath } from "next/cache"
import type {
  AdminUserListItem,
  AdminUserStatusRequest,
  AdminVerificationItem,
  FraudFlagDto,
  FraudFlagReviewInput,
  ResolveDisputeRequest,
  ResolveDisputeResponse,
  VerificationDecisionRequest,
} from "@hustl/contracts"
import { apiFetch } from "@/lib/api/client"
import { apiAction, type ApiActionResult } from "./api-result"

const seg = (v: string) => encodeURIComponent(v)
const refresh = () => revalidatePath("/admin")

/** POST /admin/disputes/:id/resolve — release to creator, refund to brand, or split. */
export async function resolveDisputeAction(disputeId: string, body: ResolveDisputeRequest): Promise<ApiActionResult<ResolveDisputeResponse>> {
  const res = await apiAction(() => apiFetch<ResolveDisputeResponse>(`/admin/disputes/${seg(disputeId)}/resolve`, { method: "POST", body }))
  if (res.ok) refresh()
  return res
}

/** POST /admin/fraud-flags/:id/review — records CLEARED / CONFIRMED. Never bans. */
export async function reviewFraudFlagAction(flagId: string, body: FraudFlagReviewInput): Promise<ApiActionResult<FraudFlagDto>> {
  const res = await apiAction(() => apiFetch<FraudFlagDto>(`/admin/fraud-flags/${seg(flagId)}/review`, { method: "POST", body }))
  if (res.ok) refresh()
  return res
}

/** POST /admin/verifications/:id/decision */
export async function decideVerificationAction(verificationId: string, body: VerificationDecisionRequest): Promise<ApiActionResult<AdminVerificationItem>> {
  const res = await apiAction(() => apiFetch<AdminVerificationItem>(`/admin/verifications/${seg(verificationId)}/decision`, { method: "POST", body }))
  if (res.ok) refresh()
  return res
}

/** PATCH /admin/users/:id/status — suspend or reactivate. */
export async function setUserStatusAction(userId: string, body: AdminUserStatusRequest): Promise<ApiActionResult<AdminUserListItem>> {
  const res = await apiAction(() => apiFetch<AdminUserListItem>(`/admin/users/${seg(userId)}/status`, { method: "PATCH", body }))
  if (res.ok) refresh()
  return res
}
