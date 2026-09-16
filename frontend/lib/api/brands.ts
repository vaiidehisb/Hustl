import type { BrandPublicProfile, OwnBrandProfile, SavedCreatorItem, SavedCreatorState, UpdateBrandProfileRequest } from "@hustl/contracts"
import { seg, type CallOptions, type Requester } from "./core"

export const brandsApi = (r: Requester) => ({
  /** GET /brands/:slug — public profile (404 when unknown). */
  get: (slug: string, o?: CallOptions) => r<BrandPublicProfile>(`/brands/${seg(slug.toLowerCase())}`, o),
  /** GET /brands/me */
  me: (o?: CallOptions) => r<OwnBrandProfile>("/brands/me", o),
  /** PUT /brands/me */
  updateMe: (body: UpdateBrandProfileRequest, o?: CallOptions) => r<OwnBrandProfile>("/brands/me", { ...o, method: "PUT", body }),
  /** GET /brands/me/saved-creators */
  savedCreators: (o?: CallOptions) => r<SavedCreatorItem[]>("/brands/me/saved-creators", o),
  /** PUT /brands/me/saved-creators/:creatorId */
  saveCreator: (creatorId: string, o?: CallOptions) => r<SavedCreatorState>(`/brands/me/saved-creators/${seg(creatorId)}`, { ...o, method: "PUT" }),
  /** DELETE /brands/me/saved-creators/:creatorId */
  unsaveCreator: (creatorId: string, o?: CallOptions) => r<SavedCreatorState>(`/brands/me/saved-creators/${seg(creatorId)}`, { ...o, method: "DELETE" }),
})
