import { prisma, type Prisma } from "@hustl/db"
import { errors } from "@hustl/common"
import { brandSlugBase, creatorHandleBase, nextFreeSlug } from "../lib/slug"

type Tx = Prisma.TransactionClient

/** Loads the caller's account for self-service endpoints: deleted → 401, suspended → 403. */
export async function loadActiveUser<I extends Prisma.UserInclude>(userId: string, include?: I, tx: Tx | typeof prisma = prisma) {
  const user = await tx.user.findUnique({ where: { id: userId }, include })
  if (!user || user.deletedAt) throw errors.unauthorized("Account not found")
  if (user.status === "SUSPENDED") throw errors.forbidden("This account is suspended")
  return user as Prisma.UserGetPayload<{ include: I }>
}

/** Visible to the public: profile and account not soft-deleted, account not suspended. */
export const activeUserFilter = { deletedAt: null, status: "ACTIVE" } as const satisfies Prisma.UserWhereInput

export async function isHandleTaken(tx: Tx | typeof prisma, handle: string) {
  return !!(await tx.creatorProfile.findUnique({ where: { handle }, select: { id: true } }))
}

async function generateHandle(tx: Tx, name: string, email: string) {
  const base = creatorHandleBase(name, email)
  const taken = await tx.creatorProfile.findMany({ where: { handle: { startsWith: base } }, select: { handle: true } })
  return nextFreeSlug(base, taken.map((t) => t.handle), "_")
}

async function generateBrandSlug(tx: Tx, companyName: string) {
  const base = brandSlugBase(companyName)
  const taken = await tx.brandProfile.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } })
  return nextFreeSlug(base, taken.map((t) => t.slug), "-")
}

export type RoleSelection = { role: "CREATOR"; handle?: string } | { role: "BRAND"; companyName: string }

/** Creates the role's profile inside the caller's transaction. An explicitly requested handle that's taken → 409. */
export async function createProfileForRole(tx: Tx, user: { id: string; name: string; email: string }, sel: RoleSelection) {
  if (sel.role === "CREATOR") {
    let handle = sel.handle
    if (handle) {
      if (await isHandleTaken(tx, handle)) throw errors.conflict("That handle is already taken", { field: "handle" })
    } else {
      handle = await generateHandle(tx, user.name, user.email)
    }
    const creator = await tx.creatorProfile.create({ data: { userId: user.id, handle } })
    return { creatorId: creator.id, brandId: null, handle: creator.handle, slug: null }
  }
  const slug = await generateBrandSlug(tx, sel.companyName)
  const brand = await tx.brandProfile.create({ data: { userId: user.id, companyName: sel.companyName, slug } })
  return { creatorId: null, brandId: brand.id, handle: null, slug: brand.slug }
}

/** Unique violations on generated identifiers are safe to retry; email/explicit-handle ones are real conflicts. */
export const isGeneratedIdentifierConflict = (explicitHandle: boolean) => (target: string) =>
  target.includes("slug") || (!explicitHandle && target.includes("handle"))
