import type {
  AdminUserListItem,
  AdminUsersQuery,
  AdminUserStatusRequest,
  AdminVerificationItem,
  AdminVerificationsQuery,
  PageMeta,
  VerificationDecisionRequest,
} from "@hustl/contracts"
import type { AdminMetrics, Dispute, FraudFlag, ResolveDisputeRequest, ReviewFraudFlagRequest } from "./types"
import { seg, type CallOptions, type Requester } from "./core"

export const adminApi = (r: Requester) => ({
  /** GET /admin/users */
  users: (query?: Partial<AdminUsersQuery>, o?: CallOptions) => r.withMeta<AdminUserListItem[], PageMeta>("/admin/users", { ...o, query }),
  /** PATCH /admin/users/:id/status */
  setUserStatus: (id: string, body: AdminUserStatusRequest, o?: CallOptions) =>
    r<AdminUserListItem>(`/admin/users/${seg(id)}/status`, { ...o, method: "PATCH", body }),
  /** GET /admin/verifications */
  verifications: (query?: Partial<AdminVerificationsQuery>, o?: CallOptions) =>
    r.withMeta<AdminVerificationItem[], PageMeta>("/admin/verifications", { ...o, query }),
  /** POST /admin/verifications/:id/decision */
  decideVerification: (id: string, body: VerificationDecisionRequest, o?: CallOptions) =>
    r<AdminVerificationItem>(`/admin/verifications/${seg(id)}/decision`, { ...o, method: "POST", body }),
  /** GET /admin/disputes */
  disputes: (query?: { status?: string; page?: number }, o?: CallOptions) => r.withMeta<Dispute[], PageMeta>("/admin/disputes", { ...o, query }),
  /** POST /admin/disputes/:id/resolve */
  resolveDispute: (id: string, body: ResolveDisputeRequest, o?: CallOptions) => r<Dispute>(`/admin/disputes/${seg(id)}/resolve`, { ...o, method: "POST", body }),
  /** GET /admin/fraud-flags?status */
  fraudFlags: (query?: { status?: FraudFlag["status"]; page?: number }, o?: CallOptions) =>
    r.withMeta<FraudFlag[], PageMeta>("/admin/fraud-flags", { ...o, query }),
  /** POST /admin/fraud-flags/:id/review */
  reviewFraudFlag: (id: string, body: ReviewFraudFlagRequest, o?: CallOptions) =>
    r<FraudFlag>(`/admin/fraud-flags/${seg(id)}/review`, { ...o, method: "POST", body }),
  /** GET /admin/metrics */
  metrics: (query?: { from?: string; to?: string }, o?: CallOptions) => r<AdminMetrics>("/admin/metrics", { ...o, query }),
})
