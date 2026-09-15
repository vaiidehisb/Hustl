import "./setup"
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { FastifyInstance } from "fastify"
import { TOPICS, type EventEnvelope, type Topic } from "@hustl/common"
import { prisma } from "@hustl/db"
import { buildApp } from "../src/app"
import { handleEvent } from "../src/consumer"
import { auth, cleanupFixtures, createDealFixture, createUser, type Fixture } from "./fixtures"

const log = { warn: () => undefined }
let app: FastifyInstance
let fx: Fixture

const event = (topic: Topic, key: string, payload: Record<string, unknown>): EventEnvelope => ({
  id: `test-${randomUUID()}`,
  topic,
  key,
  payload,
  createdAt: new Date().toISOString(),
})

const notificationsFor = (userId: string, eventId: string) => prisma.notification.findMany({ where: { userId, eventId } })

beforeAll(async () => {
  app = await buildApp({ logger: false })
  fx = await createDealFixture()
})

afterAll(async () => {
  await cleanupFixtures()
  await app.close()
})

describe("event consumer", () => {
  it("offer.sent notifies the creator once, ensures the conversation, and is idempotent", async () => {
    const e = event(TOPICS.OFFER_SENT, fx.deal.id, { dealId: fx.deal.id, amount: 20000 })
    const created = await handleEvent(e, log)
    expect(created).toHaveLength(1)
    await handleEvent(e, log) // replay

    const creatorRows = await notificationsFor(fx.creator.id, e.id)
    expect(creatorRows).toHaveLength(1)
    expect(creatorRows[0]).toMatchObject({ type: "offer.sent", href: `/creator/deals/${fx.deal.id}` })
    expect(creatorRows[0]!.body).toContain("₹20,000")
    expect(await notificationsFor(fx.brand.id, e.id)).toHaveLength(0)

    const conversation = await prisma.conversation.findUnique({ where: { dealId: fx.deal.id }, include: { participants: true } })
    expect(conversation?.participants.map((p) => p.userId).sort()).toEqual([fx.brand.id, fx.creator.id].sort())
  })

  it("milestone.submitted notifies the brand", async () => {
    const milestone = await prisma.milestone.create({ data: { dealId: fx.deal.id, position: 1, title: "First cut", percent: 50, amount: 10000, status: "SUBMITTED" } })
    const e = event(TOPICS.MILESTONE_SUBMITTED, fx.deal.id, { dealId: fx.deal.id, milestoneId: milestone.id })
    await handleEvent(e, log)
    await handleEvent(e, log)
    const rows = await notificationsFor(fx.brand.id, e.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ href: `/brand/deals/${fx.deal.id}`, title: "Deliverable submitted" })
    expect(rows[0]!.body).toContain("First cut")
    expect(await notificationsFor(fx.creator.id, e.id)).toHaveLength(0)
  })

  it("milestone.payment_released uses the payout row when the payload has no net amount", async () => {
    const milestone = await prisma.milestone.create({ data: { dealId: fx.deal.id, position: 2, title: "Final", percent: 50, amount: 10000, status: "RELEASED" } })
    await prisma.payout.create({ data: { dealId: fx.deal.id, milestoneId: milestone.id, creatorId: fx.creatorProfile.id, gross: 10000, fee: 1000, net: 9000, provider: "TEST" } })

    const fromRow = event(TOPICS.PAYMENT_RELEASED, fx.deal.id, { dealId: fx.deal.id, milestoneId: milestone.id })
    await handleEvent(fromRow, log)
    await handleEvent(fromRow, log)
    const rows = await notificationsFor(fx.creator.id, fromRow.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ href: "/creator/earnings", type: "milestone.payment_released" })
    expect(rows[0]!.body).toContain("₹9,000")
    expect(await notificationsFor(fx.brand.id, fromRow.id)).toHaveLength(0)

    const fromPayload = event(TOPICS.PAYMENT_RELEASED, fx.deal.id, { dealId: fx.deal.id, milestoneId: milestone.id, net: 8500 })
    await handleEvent(fromPayload, log)
    expect((await notificationsFor(fx.creator.id, fromPayload.id))[0]!.body).toContain("₹8,500")
  })

  it("skips events whose records don't exist instead of failing", async () => {
    await expect(handleEvent(event(TOPICS.DEAL_COMPLETED, randomUUID(), { dealId: randomUUID() }), log)).resolves.toEqual([])
  })

  it("notifications REST: list, unread count, mark own as read only", async () => {
    const outsider = await createUser("CREATOR")
    const h = auth(fx.creator.token)
    const unreadBefore = (await app.inject({ method: "GET", url: "/notifications/unread-count", headers: h })).json().data.count
    expect(unreadBefore).toBeGreaterThanOrEqual(3)

    const list = (await app.inject({ method: "GET", url: "/notifications?unread=true&limit=2", headers: h })).json()
    expect(list.data).toHaveLength(2)
    expect(list.meta.nextCursor).toBe(list.data[1].id)
    const next = (await app.inject({ method: "GET", url: `/notifications?unread=true&limit=2&cursor=${list.meta.nextCursor}`, headers: h })).json()
    expect(next.data[0].id).not.toBe(list.data[1].id)

    const target = list.data[0].id
    const foreign = await app.inject({ method: "POST", url: "/notifications/read", headers: auth(outsider.token), payload: { ids: [target] } })
    expect(foreign.json().data.updated).toBe(0)

    const mine = await app.inject({ method: "POST", url: "/notifications/read", headers: h, payload: { ids: [target] } })
    expect(mine.json().data).toMatchObject({ updated: 1, unreadCount: unreadBefore - 1 })

    const all = await app.inject({ method: "POST", url: "/notifications/read", headers: h, payload: {} })
    expect(all.json().data.unreadCount).toBe(0)
    expect((await app.inject({ method: "GET", url: "/notifications?unread=true", headers: h })).json().data).toHaveLength(0)
  })
})
