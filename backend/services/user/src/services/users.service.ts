import { prisma } from "@hustl/db"
import type { MeResponse, ProfileCompletion, PublicUser, UpdateMeRequest } from "@hustl/contracts"
import { toOwnBrandProfile, toOwnCreatorProfile, toPublicUser } from "../lib/mappers"
import { loadActiveUser } from "../repositories/users.repository"
import { ADMIN_COMPLETION, brandCompletion, creatorCompletion, ROLE_MISSING_COMPLETION } from "./profile-completion"

/** Social accounts that count as "connected" for profile completion. */
export const countLinkedSocialAccounts = (creatorId: string) =>
  prisma.socialAccount.count({ where: { creatorId, status: { not: "DISCONNECTED" } } })

export async function getMe(userId: string): Promise<MeResponse> {
  const user = await loadActiveUser(userId, { creator: true, brand: true })
  const creator = user.creator && !user.creator.deletedAt ? user.creator : null
  const brand = user.brand && !user.brand.deletedAt ? user.brand : null

  let profileCompletion: ProfileCompletion
  if (user.role === "ADMIN") profileCompletion = ADMIN_COMPLETION
  else if (creator) profileCompletion = creatorCompletion(creator, await countLinkedSocialAccounts(creator.id))
  else if (brand) profileCompletion = brandCompletion(brand)
  else profileCompletion = ROLE_MISSING_COMPLETION

  return {
    user: toPublicUser(user),
    creator: creator ? toOwnCreatorProfile(creator) : null,
    brand: brand ? toOwnBrandProfile(brand) : null,
    profileCompletion,
  }
}

export async function updateMe(userId: string, input: UpdateMeRequest): Promise<PublicUser> {
  const user = await loadActiveUser(userId)
  if (input.name === undefined && input.image === undefined) return toPublicUser(user)
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { ...(input.name !== undefined && { name: input.name }), ...(input.image !== undefined && { image: input.image }) },
  })
  return toPublicUser(updated)
}
