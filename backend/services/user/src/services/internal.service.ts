// Service-to-service lookups. Soft-deleted/suspended records are returned with flags; callers decide.
import { prisma } from "@hustl/db"
import { errors } from "@hustl/common"
import type { InternalBrand, InternalCreator, InternalUser } from "@hustl/contracts"
import { toInternalUser, toOwnBrandProfile, toOwnCreatorProfile } from "../lib/mappers"

const profileIds = { creator: { select: { id: true } }, brand: { select: { id: true } } } as const

export async function getInternalUser(id: string): Promise<InternalUser> {
  const user = await prisma.user.findUnique({ where: { id }, include: profileIds })
  if (!user) throw errors.notFound("User")
  return toInternalUser(user)
}

/** Unknown ids are simply absent from the result. */
export async function getInternalUsers(ids: string[]): Promise<InternalUser[]> {
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, include: profileIds })
  return users.map(toInternalUser)
}

const withUser = { user: { include: profileIds } } as const

export async function getInternalCreator(where: { id: string } | { userId: string }): Promise<InternalCreator> {
  const c = await prisma.creatorProfile.findUnique({ where: "id" in where ? { id: where.id } : { userId: where.userId }, include: withUser })
  if (!c) throw errors.notFound("Creator")
  return { ...toOwnCreatorProfile(c), user: toInternalUser(c.user), deleted: !!c.deletedAt }
}

export async function getInternalBrand(where: { id: string } | { userId: string }): Promise<InternalBrand> {
  const b = await prisma.brandProfile.findUnique({ where: "id" in where ? { id: where.id } : { userId: where.userId }, include: withUser })
  if (!b) throw errors.notFound("Brand")
  return { ...toOwnBrandProfile(b), user: toInternalUser(b.user), deleted: !!b.deletedAt }
}
