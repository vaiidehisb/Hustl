import type { ChooseRoleRequest, ChooseRoleResponse, CreateVerificationRequest, MeResponse, PublicUser, UpdateMeRequest, VerificationRequestDto } from "@hustl/contracts"
import type { CallOptions, Requester } from "./core"

export const usersApi = (r: Requester) => ({
  /** GET /users/me — user + own profile + completion. */
  me: (o?: CallOptions) => r<MeResponse>("/users/me", o),
  /** PATCH /users/me */
  updateMe: (body: UpdateMeRequest, o?: CallOptions) => r<PublicUser>("/users/me", { ...o, method: "PATCH", body }),
  /** POST /users/me/role — only while role is null; returns a new access token. */
  chooseRole: (body: ChooseRoleRequest, o?: CallOptions) => r<ChooseRoleResponse>("/users/me/role", { ...o, method: "POST", body }),
  /** POST /verifications */
  createVerification: (body: CreateVerificationRequest, o?: CallOptions) => r<VerificationRequestDto>("/verifications", { ...o, method: "POST", body }),
  /** GET /verifications/me */
  myVerifications: (o?: CallOptions) => r<VerificationRequestDto[]>("/verifications/me", o),
})
