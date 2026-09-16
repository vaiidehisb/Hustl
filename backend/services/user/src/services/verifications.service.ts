import { prisma, type Prisma } from "@hustl/db"
import { errors } from "@hustl/common"
import type { CreateVerificationRequest, VerificationRequestDto } from "@hustl/contracts"
import { toVerificationDto } from "../lib/mappers"
import { loadActiveUser } from "../repositories/users.repository"

const TYPE_FOR_ROLE = { CREATOR: "CREATOR_IDENTITY", BRAND: "BRAND_BUSINESS" } as const

export async function submitVerification(userId: string, input: CreateVerificationRequest): Promise<VerificationRequestDto> {
  const user = await loadActiveUser(userId)
  if (user.role !== "CREATOR" && user.role !== "BRAND") throw errors.forbidden("Only creators and brands can request verification")
  if (TYPE_FOR_ROLE[user.role] !== input.type)
    throw errors.validation("Invalid request", { fieldErrors: { type: [`${user.role.toLowerCase()} accounts must use ${TYPE_FOR_ROLE[user.role]}`] } })
  if (user.kycStatus === "VERIFIED") throw errors.conflict("Your account is already verified")

  if (input.documentIds.length) {
    const owned = await prisma.mediaAsset.count({ where: { id: { in: input.documentIds }, ownerId: userId } })
    if (owned !== input.documentIds.length)
      throw errors.validation("Invalid request", { fieldErrors: { documentIds: ["One or more documents were not found or are not yours"] } })
  }

  const created = await prisma.$transaction(async (tx) => {
    // Lock the user row so two concurrent submissions can't both pass the pending check.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`
    const pending = await tx.verificationRequest.findFirst({ where: { userId, status: "PENDING" }, select: { id: true } })
    if (pending) throw errors.conflict("A verification request is already under review", { verificationId: pending.id })
    const row = await tx.verificationRequest.create({
      data: { userId, type: input.type, details: input.details as Prisma.InputJsonValue, documentIds: input.documentIds },
    })
    await tx.user.update({ where: { id: userId }, data: { kycStatus: "PENDING" } })
    return row
  })
  return toVerificationDto(created)
}

export async function listMyVerifications(userId: string): Promise<VerificationRequestDto[]> {
  await loadActiveUser(userId)
  const rows = await prisma.verificationRequest.findMany({ where: { userId }, orderBy: { createdAt: "desc" } })
  return rows.map(toVerificationDto)
}
