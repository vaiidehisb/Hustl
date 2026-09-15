import "./setup"
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { FastifyInstance } from "fastify"
import { prisma } from "@hustl/db"
import { buildApp } from "../src/app"
import { auth, cleanupFixtures, createDealFixture, createUser, type Fixture } from "./fixtures"

let app: FastifyInstance
let fx: Fixture
let outsider: Awaited<ReturnType<typeof createUser>>
let conversationId: string
const internal = () => ({ "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN! })

beforeAll(async () => {
  app = await buildApp({ logger: false })
  fx = await createDealFixture()
  outsider = await createUser("CREATOR")
})

afterAll(async () => {
  await cleanupFixtures()
  await app.close()
})

describe("POST /internal/conversations/ensure", () => {
  it("requires the internal token and exactly one id", async () => {
    expect((await app.inject({ method: "POST", url: "/internal/conversations/ensure", payload: { dealId: fx.deal.id } })).statusCode).toBe(403)
    const both = await app.inject({ method: "POST", url: "/internal/conversations/ensure", headers: internal(), payload: { dealId: fx.deal.id, applicationId: fx.application.id } })
    expect(both.statusCode).toBe(422)
  })

  it("is idempotent and resolves brand + creator participants", async () => {
    const first = await app.inject({ method: "POST", url: "/internal/conversations/ensure", headers: internal(), payload: { dealId: fx.deal.id } })
    expect(first.statusCode).toBe(201)
    conversationId = first.json().data.id
    expect(first.json().data.created).toBe(true)

    const again = await app.inject({ method: "POST", url: "/internal/conversations/ensure", headers: internal(), payload: { dealId: fx.deal.id } })
    expect(again.statusCode).toBe(200)
    expect(again.json().data).toEqual({ id: conversationId, created: false })

    // The application (already linked to this deal) resolves to the same thread.
    const viaApp = await app.inject({ method: "POST", url: "/internal/conversations/ensure", headers: internal(), payload: { applicationId: fx.application.id } })
    expect(viaApp.json().data.id).toBe(conversationId)

    const participants = await prisma.conversationParticipant.findMany({ where: { conversationId } })
    expect(participants.map((p) => p.userId).sort()).toEqual([fx.brand.id, fx.creator.id].sort())
  })

  it("404s for an unknown deal", async () => {
    const res = await app.inject({ method: "POST", url: "/internal/conversations/ensure", headers: internal(), payload: { dealId: randomUUID() } })
    expect(res.statusCode).toBe(404)
  })
})

describe("participant checks", () => {
  it("requires authentication", async () => {
    expect((await app.inject({ method: "GET", url: "/conversations" })).statusCode).toBe(401)
  })

  it("non-participants get 404 on read, post and mark-read", async () => {
    const h = auth(outsider.token)
    expect((await app.inject({ method: "GET", url: `/conversations/${conversationId}`, headers: h })).statusCode).toBe(404)
    expect((await app.inject({ method: "GET", url: `/conversations/${conversationId}/messages`, headers: h })).statusCode).toBe(404)
    expect((await app.inject({ method: "POST", url: `/conversations/${conversationId}/messages`, headers: h, payload: { body: "hi" } })).statusCode).toBe(404)
    expect((await app.inject({ method: "POST", url: `/conversations/${conversationId}/read`, headers: h })).statusCode).toBe(404)
    expect((await app.inject({ method: "GET", url: `/conversations/not-a-uuid/messages`, headers: h })).statusCode).toBe(404)
    const list = await app.inject({ method: "GET", url: "/conversations", headers: h })
    expect(list.json().data.find((c: { id: string }) => c.id === conversationId)).toBeUndefined()
  })
})

describe("messages", () => {
  it("validates the body and attachments", async () => {
    const h = auth(fx.creator.token)
    const url = `/conversations/${conversationId}/messages`
    expect((await app.inject({ method: "POST", url, headers: h, payload: { body: "   " } })).statusCode).toBe(422)
    expect((await app.inject({ method: "POST", url, headers: h, payload: { body: "x".repeat(4001) } })).statusCode).toBe(422)
    expect((await app.inject({ method: "POST", url, headers: h, payload: {} })).statusCode).toBe(422)
    expect((await app.inject({ method: "POST", url, headers: h, payload: { body: "ok", attachmentIds: ["nope"] } })).statusCode).toBe(422)
    // Well-formed id that isn't the sender's ready media asset.
    expect((await app.inject({ method: "POST", url, headers: h, payload: { body: "ok", attachmentIds: [randomUUID()] } })).statusCode).toBe(422)
    const max = await app.inject({ method: "POST", url, headers: h, payload: { body: `  ${"y".repeat(4000)}  ` } })
    expect(max.statusCode).toBe(201)
    expect(max.json().data.body).toHaveLength(4000)
  })

  it("counts unread, pages newest-first and marks read", async () => {
    const c = auth(fx.creator.token)
    const b = auth(fx.brand.token)
    const url = `/conversations/${conversationId}/messages`
    const m1 = await app.inject({ method: "POST", url, headers: c, payload: { body: "First" } })
    const m2 = await app.inject({ method: "POST", url, headers: c, payload: { body: "Second" } })
    expect(m2.statusCode).toBe(201)

    // 3 creator messages (incl. the 4000-char one) are unread for the brand, none for the creator.
    expect((await app.inject({ method: "GET", url: "/conversations/unread-count", headers: b })).json().data.count).toBe(3)
    expect((await app.inject({ method: "GET", url: "/conversations/unread-count", headers: c })).json().data.count).toBe(0)

    const list = await app.inject({ method: "GET", url: "/conversations", headers: b })
    const summary = list.json().data.find((x: { id: string }) => x.id === conversationId)
    expect(summary).toMatchObject({
      unreadCount: 3,
      lastMessage: { body: "Second" },
      counterpart: { userId: fx.creator.id, handle: fx.creatorProfile.handle, avatarUrl: fx.creatorProfile.avatarUrl },
      deal: { id: fx.deal.id, title: fx.deal.title, status: "OFFER_SENT" },
      readOnly: false,
    })
    const creatorView = (await app.inject({ method: "GET", url: `/conversations/${conversationId}`, headers: c })).json().data
    expect(creatorView.counterpart).toMatchObject({ name: fx.brandProfile.companyName, avatarUrl: fx.brandProfile.logoUrl, handle: null })

    const page1 = (await app.inject({ method: "GET", url: `${url}?limit=1`, headers: b })).json()
    expect(page1.data.map((m: { id: string }) => m.id)).toEqual([m2.json().data.id])
    const page2 = (await app.inject({ method: "GET", url: `${url}?limit=1&before=${page1.meta.nextCursor}`, headers: b })).json()
    expect(page2.data[0].id).toBe(m1.json().data.id)

    const read = await app.inject({ method: "POST", url: `/conversations/${conversationId}/read`, headers: b })
    expect(read.statusCode).toBe(200)
    expect((await app.inject({ method: "GET", url: "/conversations/unread-count", headers: b })).json().data.count).toBe(0)

    const events = await prisma.outboxEvent.count({ where: { topic: "message.sent", key: conversationId } })
    expect(events).toBe(3)
  })

  it("cursor-paginates conversations", async () => {
    const other = await createDealFixture()
    // Put the brand from fx into a second conversation via a second deal with the same brand.
    const deal2 = await prisma.deal.create({
      data: { title: "Second deal", brandId: fx.brandProfile.id, creatorId: other.creatorProfile.id, amount: 5000, paymentMode: "COMPLETION", brandFeeRate: 0.05, creatorFeeRate: 0.1, processingFeeRate: 0.02 },
    })
    const ensured = await app.inject({ method: "POST", url: "/internal/conversations/ensure", headers: internal(), payload: { dealId: deal2.id } })
    const b = auth(fx.brand.token)
    const p1 = (await app.inject({ method: "GET", url: "/conversations?limit=1", headers: b })).json()
    expect(p1.data).toHaveLength(1)
    expect(p1.meta.nextCursor).toBeTruthy()
    const p2 = (await app.inject({ method: "GET", url: `/conversations?limit=1&cursor=${p1.meta.nextCursor}`, headers: b })).json()
    expect(p2.data).toHaveLength(1)
    expect(new Set([p1.data[0].id, p2.data[0].id])).toEqual(new Set([conversationId, ensured.json().data.id]))
    expect(p2.meta.nextCursor).toBeNull()
    await prisma.conversation.deleteMany({ where: { dealId: deal2.id } })
    await prisma.deal.delete({ where: { id: deal2.id } })
  })

  it("blocks posting 30 days after the deal was cancelled", async () => {
    await prisma.deal.update({ where: { id: fx.deal.id }, data: { status: "CANCELLED", cancelledAt: new Date(Date.now() - 31 * 86_400_000) } })
    const res = await app.inject({ method: "POST", url: `/conversations/${conversationId}/messages`, headers: auth(fx.brand.token), payload: { body: "Still there?" } })
    expect(res.statusCode).toBe(403)
    const history = await app.inject({ method: "GET", url: `/conversations/${conversationId}/messages`, headers: auth(fx.brand.token) })
    expect(history.statusCode).toBe(200)
    await prisma.deal.update({ where: { id: fx.deal.id }, data: { status: "OFFER_SENT", cancelledAt: null } })
  })
})
