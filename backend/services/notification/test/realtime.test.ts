import "./setup"
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { FastifyInstance } from "fastify"
import jwt from "jsonwebtoken"
import { AppError } from "@hustl/common"
import { buildApp } from "../src/app"
import { ensureConversation } from "../src/conversations"
import { authenticateHandshake, authorizeConversationJoin } from "../src/realtime"
import { cleanupFixtures, createDealFixture, createUser, type Fixture } from "./fixtures"

let app: FastifyInstance
let fx: Fixture
let outsider: Awaited<ReturnType<typeof createUser>>
let conversationId: string
let port: number

beforeAll(async () => {
  app = await buildApp({ logger: false })
  fx = await createDealFixture()
  outsider = await createUser("BRAND")
  conversationId = (await ensureConversation({ dealId: fx.deal.id })).id
  await app.listen({ port: 0, host: "127.0.0.1" })
  port = (app.server.address() as { port: number }).port
})

afterAll(async () => {
  await app.close()
  await cleanupFixtures()
})

describe("socket auth (unit)", () => {
  it("rejects missing, malformed and expired tokens", () => {
    expect(() => authenticateHandshake({ auth: {}, headers: {} })).toThrow(AppError)
    expect(() => authenticateHandshake({ auth: { token: "garbage" } })).toThrow(/Invalid access token/)
    const expired = jwt.sign({ email: "x@y.z", role: "BRAND" }, process.env.JWT_SECRET!, { subject: randomUUID(), issuer: "hustl.user-service", expiresIn: -10 })
    expect(() => authenticateHandshake({ auth: { token: expired } })).toThrow(/expired/)
    const wrongSecret = jwt.sign({ email: "x@y.z", role: "BRAND" }, "x".repeat(40), { subject: randomUUID(), issuer: "hustl.user-service" })
    expect(() => authenticateHandshake({ headers: { authorization: `Bearer ${wrongSecret}` } })).toThrow(AppError)
  })

  it("accepts auth.token or an Authorization header", () => {
    expect(authenticateHandshake({ auth: { token: fx.brand.token } }).id).toBe(fx.brand.id)
    expect(authenticateHandshake({ headers: { authorization: `Bearer ${fx.creator.token}` } }).id).toBe(fx.creator.id)
  })

  it("only participants may join a conversation room", async () => {
    expect(await authorizeConversationJoin(fx.brand.id, conversationId)).toBeNull()
    expect(await authorizeConversationJoin(outsider.id, conversationId)).toMatchObject({ code: "NOT_FOUND" })
    expect(await authorizeConversationJoin(fx.brand.id, "nope")).toMatchObject({ code: "VALIDATION_ERROR" })
  })
})

// Minimal Engine.IO v4 / Socket.IO v5 client over Node's global WebSocket (no extra deps).
function connectRaw(auth: Record<string, unknown>) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`)
  const frames: string[] = []
  const waiters: { match: (f: string) => boolean; resolve: (f: string) => void }[] = []
  ws.addEventListener("message", (ev) => {
    const frame = String(ev.data)
    if (frame === "2") return ws.send("3") // ping → pong
    if (frame.startsWith("0")) ws.send(`40${JSON.stringify(auth)}`) // engine open → socket.io connect
    frames.push(frame)
    for (const w of [...waiters]) if (w.match(frame)) (waiters.splice(waiters.indexOf(w), 1), w.resolve(frame))
  })
  const waitFor = (match: (f: string) => boolean, timeoutMs = 4000) =>
    new Promise<string>((resolve, reject) => {
      const hit = frames.find(match)
      if (hit) return resolve(hit)
      const timer = setTimeout(() => reject(new Error(`timed out; frames: ${frames.join(" | ")}`)), timeoutMs)
      waiters.push({ match, resolve: (f) => (clearTimeout(timer), resolve(f)) })
    })
  return { ws, waitFor, send: (s: string) => ws.send(s), close: () => ws.close() }
}

describe("socket.io server (integration)", () => {
  it("rejects a bad token with connect_error", async () => {
    const c = connectRaw({ token: "not-a-jwt" })
    const frame = await c.waitFor((f) => f.startsWith("44"))
    expect(JSON.parse(frame.slice(2))).toMatchObject({ message: "Invalid access token", data: { code: "UNAUTHORIZED" } })
    c.close()
  })

  it("emits an error when a non-participant joins, and acks participants", async () => {
    const intruder = connectRaw({ token: outsider.token })
    await intruder.waitFor((f) => f.startsWith("40{"))
    intruder.send(`421["conversation:join",${JSON.stringify({ conversationId })}]`)
    const err = await intruder.waitFor((f) => f.startsWith('42["error"'))
    expect(JSON.parse(err.slice(2))[1]).toMatchObject({ code: "NOT_FOUND", event: "conversation:join" })
    const ack = await intruder.waitFor((f) => f.startsWith("431"))
    expect(JSON.parse(ack.slice(3))[0]).toMatchObject({ ok: false })
    intruder.close()

    const member = connectRaw({ token: fx.brand.token })
    await member.waitFor((f) => f.startsWith("40{"))
    member.send(`422["conversation:join",${JSON.stringify({ conversationId })}]`)
    expect(JSON.parse((await member.waitFor((f) => f.startsWith("432"))).slice(3))[0]).toEqual({ ok: true })
    member.close()
  })
})
