import { randomUUID } from "node:crypto"
import { signAccessToken } from "@hustl/common"
import { prisma, type UserRole } from "@hustl/db"

const tag = () => randomUUID().slice(0, 8)

export type Fixture = Awaited<ReturnType<typeof createDealFixture>>

const userIds: string[] = []
const dealIds: string[] = []

export async function createUser(role: UserRole, name = `Test ${role.toLowerCase()} ${tag()}`) {
  const user = await prisma.user.create({ data: { email: `notif-${tag()}-${randomUUID()}@test.hustl.local`, name, role } })
  userIds.push(user.id)
  return { ...user, token: signAccessToken({ id: user.id, email: user.email, role }) }
}

/** Brand + creator (+ brief, application, deal) with unique random identifiers. */
export async function createDealFixture() {
  const t = tag()
  const brand = await createUser("BRAND", `Brand owner ${t}`)
  const creator = await createUser("CREATOR", `Creator ${t}`)
  const brandProfile = await prisma.brandProfile.create({ data: { userId: brand.id, slug: `acme-${t}-${randomUUID().slice(0, 6)}`, companyName: `Acme ${t}`, logoUrl: `https://cdn.example.com/${t}.png` } })
  const creatorProfile = await prisma.creatorProfile.create({ data: { userId: creator.id, handle: `c_${t}_${randomUUID().slice(0, 6)}`, avatarUrl: `https://cdn.example.com/a-${t}.png` } })
  const brief = await prisma.brief.create({ data: { brandId: brandProfile.id, title: `Summer launch ${t}`, description: "Reels for launch", budgetPerCreator: 25000, status: "PUBLISHED" } })
  const application = await prisma.application.create({ data: { briefId: brief.id, creatorId: creatorProfile.id, pitch: "I'd love to", proposedRate: 20000 } })
  const deal = await prisma.deal.create({
    data: {
      title: `Launch reel ${t}`,
      briefId: brief.id,
      applicationId: application.id,
      brandId: brandProfile.id,
      creatorId: creatorProfile.id,
      amount: 20000,
      paymentMode: "MILESTONES",
      brandFeeRate: 0.05,
      creatorFeeRate: 0.1,
      processingFeeRate: 0.02,
    },
  })
  dealIds.push(deal.id)
  return { brand, creator, brandProfile, creatorProfile, brief, application, deal }
}

export async function cleanupFixtures() {
  const convs = await prisma.conversation.findMany({ where: { OR: [{ dealId: { in: dealIds } }, { participants: { some: { userId: { in: userIds } } } }] }, select: { id: true } })
  const convIds = convs.map((c) => c.id)
  await prisma.outboxEvent.deleteMany({ where: { topic: "message.sent", key: { in: convIds } } })
  await prisma.conversation.deleteMany({ where: { id: { in: convIds } } })
  await prisma.payout.deleteMany({ where: { dealId: { in: dealIds } } })
  await prisma.deal.deleteMany({ where: { id: { in: dealIds } } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  userIds.length = 0
  dealIds.length = 0
}

export const auth = (token: string) => ({ authorization: `Bearer ${token}` })
