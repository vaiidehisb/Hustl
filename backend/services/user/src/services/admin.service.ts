import { prisma, type Prisma } from "@hustl/db"
import { errors, pageMeta, publish, TOPICS } from "@hustl/common"
import type {
  AdminUserListItem,
  AdminUsersQuery,
  AdminUserStatusRequest,
  AdminVerificationItem,
  AdminVerificationsQuery,
  VerificationDecisionRequest,
  VerificationRequestDto,
} from "@hustl/contracts"
import { toVerificationDto } from "../lib/mappers"
import { revokeAllRefreshTokens } from "./auth.service"

const userListInclude = {
  creator: { select: { id: true, handle: true } },
  brand: { select: { id: true, slug: true, companyName: true } },
} satisfies Prisma.UserInclude

type UserRow = Prisma.UserGetPayload<{ include: typeof userListInclude }>

const toAdminUser = (u: UserRow): AdminUserListItem => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  status: u.status,
  kycStatus: u.kycStatus,
  createdAt: u.createdAt.toISOString(),
  lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  creator: u.creator,
  brand: u.brand,
})

export async function listUsers(q: AdminUsersQuery) {
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(q.role && { role: q.role }),
    ...(q.status && { status: q.status }),
    ...(q.q && {
      OR: [
        { email: { contains: q.q, mode: "insensitive" } },
        { name: { contains: q.q, mode: "insensitive" } },
        { creator: { handle: { contains: q.q.toLowerCase() } } },
        { brand: { companyName: { contains: q.q, mode: "insensitive" } } },
      ],
    }),
  }
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, include: userListInclude, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
  ])
  return { items: rows.map(toAdminUser), meta: pageMeta(q, total) }
}

export async function setUserStatus(adminId: string, userId: string, input: AdminUserStatusRequest): Promise<AdminUserListItem> {
  if (adminId === userId) throw errors.badRequest("You can't change the status of your own account")
  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true } })
    if (!existing) throw errors.notFound("User")
    const user = await tx.user.update({ where: { id: userId }, data: { status: input.status }, include: userListInclude })
    // Suspension takes effect at the latest when the current 15-minute access token expires.
    if (input.status === "SUSPENDED") await revokeAllRefreshTokens(userId, tx)
    return toAdminUser(user)
  })
}

export async function listVerifications(q: AdminVerificationsQuery) {
  const where: Prisma.VerificationRequestWhereInput = { status: q.status, user: { deletedAt: null } }
  const [total, rows] = await Promise.all([
    prisma.verificationRequest.count({ where }),
    prisma.verificationRequest.findMany({
      where,
      // Oldest pending first so the review queue is FIFO; decided requests newest first.
      orderBy: { createdAt: q.status === "PENDING" ? "asc" : "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            kycStatus: true,
            creator: { select: { id: true, handle: true } },
            brand: { select: { id: true, slug: true, companyName: true, gstin: true } },
          },
        },
      },
    }),
  ])
  const items: AdminVerificationItem[] = rows.map(({ user: { creator, brand, ...user }, ...v }) => ({
    ...toVerificationDto({ ...v, userId: user.id }),
    user,
    creator,
    brand,
  }))
  return { items, meta: pageMeta(q, total) }
}

export async function decideVerification(adminId: string, verificationId: string, input: VerificationDecisionRequest): Promise<VerificationRequestDto> {
  return prisma.$transaction(async (tx) => {
    const request = await tx.verificationRequest.findUnique({
      where: { id: verificationId },
      include: { user: { include: { creator: { select: { id: true } }, brand: { select: { id: true } } } } },
    })
    if (!request || request.user.deletedAt) throw errors.notFound("Verification request")
    if (request.status !== "PENDING") throw errors.conflict(`This request was already ${request.status.toLowerCase()}`)

    const now = new Date()
    const { count } = await tx.verificationRequest.updateMany({
      where: { id: verificationId, status: "PENDING" },
      data: { status: input.approve ? "APPROVED" : "REJECTED", reviewerId: adminId, reviewerNote: input.note || null, reviewedAt: now },
    })
    if (count !== 1) throw errors.conflict("This request was already decided")

    await tx.user.update({ where: { id: request.userId }, data: { kycStatus: input.approve ? "VERIFIED" : "REJECTED" } })
    const { creator, brand } = request.user
    if (input.approve) {
      if (request.type === "CREATOR_IDENTITY" && creator) await tx.creatorProfile.update({ where: { id: creator.id }, data: { verifiedAt: now } })
      if (request.type === "BRAND_BUSINESS" && brand) await tx.brandProfile.update({ where: { id: brand.id }, data: { verifiedAt: now } })
      await publish(tx, TOPICS.USER_KYC_VERIFIED, request.userId, {
        userId: request.userId,
        verificationId,
        type: request.type,
        role: request.user.role,
        creatorId: creator?.id ?? null,
        brandId: brand?.id ?? null,
        verifiedAt: now.toISOString(),
      })
    }
    return toVerificationDto(await tx.verificationRequest.findUniqueOrThrow({ where: { id: verificationId } }))
  })
}
