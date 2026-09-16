import type { CreatorDemographics, CreatorMetrics, PhylloSdkToken, SelfReportedAccountRequest, SocialAccount, SocialProviders } from "./types"
import { seg, type CallOptions, type Requester } from "./core"

export const socialApi = (r: Requester) => ({
  /** GET /social/providers — which integrations are configured. */
  providers: (o?: CallOptions) => r<SocialProviders>("/social/providers", o),
  /** POST /social/phyllo/sdk-token — 503 without Phyllo creds. */
  phylloSdkToken: (o?: CallOptions) => r<PhylloSdkToken>("/social/phyllo/sdk-token", { ...o, method: "POST" }),
  /** GET /social/accounts/me */
  myAccounts: (o?: CallOptions) => r<SocialAccount[]>("/social/accounts/me", o),
  /** POST /social/accounts/self-reported — always labelled unverified. */
  addSelfReported: (body: SelfReportedAccountRequest, o?: CallOptions) => r<SocialAccount>("/social/accounts/self-reported", { ...o, method: "POST", body }),
  /** DELETE /social/accounts/:id */
  removeAccount: (id: string, o?: CallOptions) => r<{ deleted: true }>(`/social/accounts/${seg(id)}`, { ...o, method: "DELETE" }),
  /** POST /social/accounts/me/sync — Phyllo refresh. */
  syncMine: (o?: CallOptions) => r<SocialAccount[]>("/social/accounts/me/sync", { timeoutMs: 30_000, ...o, method: "POST" }),
  /** GET /social/creators/:creatorId/metrics */
  creatorMetrics: (creatorId: string, o?: CallOptions) => r<CreatorMetrics>(`/social/creators/${seg(creatorId)}/metrics`, o),
  /** GET /social/creators/:creatorId/demographics */
  creatorDemographics: (creatorId: string, o?: CallOptions) => r<CreatorDemographics>(`/social/creators/${seg(creatorId)}/demographics`, o),
})
