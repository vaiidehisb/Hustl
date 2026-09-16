import type { CreatorPublicProfile, OwnCreatorProfile, UpdateCreatorProfileRequest } from "@hustl/contracts"
import { seg, type CallOptions, type Requester } from "./core"

export const creatorsApi = (r: Requester) => ({
  /** GET /creators/:handle — public profile (404 when unknown). */
  get: (handle: string, o?: CallOptions) => r<CreatorPublicProfile>(`/creators/${seg(handle.replace(/^@/, "").toLowerCase())}`, o),
  /** GET /creators/me */
  me: (o?: CallOptions) => r<OwnCreatorProfile>("/creators/me", o),
  /** PUT /creators/me — partial update. */
  updateMe: (body: UpdateCreatorProfileRequest, o?: CallOptions) => r<OwnCreatorProfile>("/creators/me", { ...o, method: "PUT", body }),
})
