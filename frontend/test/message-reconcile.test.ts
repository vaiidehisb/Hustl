// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { MessageDTO } from "@hustl/contracts"
import { createPending, dedupeMessages, mergeThread, reconcilePending, upsertMessage, type PendingMessage } from "@/components/messaging/reconcile"

const ME = "user-me"
const THEM = "user-them"
const CONV = "conv-1"

const msg = (id: string, body: string, senderId: string, createdAt: string): MessageDTO => ({
  id,
  conversationId: CONV,
  senderId,
  body,
  attachmentIds: [],
  createdAt,
  editedAt: null,
})

const pendingOf = (body: string, createdAt: string, status: PendingMessage["status"] = "sending"): PendingMessage => ({
  clientId: `c-${body}`,
  conversationId: CONV,
  senderId: ME,
  body,
  createdAt,
  status,
})

describe("thread ordering", () => {
  it("sorts oldest first and drops duplicate ids from overlapping pages", () => {
    const merged = dedupeMessages([
      msg("m2", "second", THEM, "2026-09-16T10:01:00.000Z"),
      msg("m1", "first", ME, "2026-09-16T10:00:00.000Z"),
      msg("m2", "second (updated)", THEM, "2026-09-16T10:01:00.000Z"),
    ])
    expect(merged.map((m) => m.id)).toEqual(["m1", "m2"])
    expect(merged[1]!.body).toBe("second (updated)")
  })

  it("upserts a socket message without duplicating it", () => {
    const base = [msg("m1", "hi", ME, "2026-09-16T10:00:00.000Z")]
    const once = upsertMessage(base, msg("m2", "yo", THEM, "2026-09-16T10:02:00.000Z"))
    const twice = upsertMessage(once, msg("m2", "yo", THEM, "2026-09-16T10:02:00.000Z"))
    expect(twice).toHaveLength(2)
  })
})

describe("optimistic reconciliation", () => {
  it("shows an optimistic message immediately, after the confirmed ones", () => {
    const server = [msg("m1", "hi", THEM, "2026-09-16T10:00:00.000Z")]
    const items = mergeThread(server, [pendingOf("on it", "2026-09-16T10:00:30.000Z")])
    expect(items.map((i) => i.kind)).toEqual(["sent", "pending"])
  })

  it("drops the optimistic copy when the server echo of the same send arrives", () => {
    const pending = [pendingOf("on it", "2026-09-16T10:00:30.000Z")]
    const server = [msg("m1", "hi", THEM, "2026-09-16T10:00:00.000Z"), msg("m2", "on it", ME, "2026-09-16T10:00:31.000Z")]
    expect(reconcilePending(server, pending)).toHaveLength(0)
    const items = mergeThread(server, pending)
    expect(items).toHaveLength(2)
    expect(items.every((i) => i.kind === "sent")).toBe(true)
  })

  it("keeps an identical message sent twice on purpose", () => {
    const pending = [pendingOf("ok", "2026-09-16T10:05:00.000Z")]
    const server = [msg("m1", "ok", ME, "2026-09-16T10:00:00.000Z")] // far outside the echo window
    expect(reconcilePending(server, pending)).toHaveLength(1)
  })

  it("matches only one pending message per server echo", () => {
    const pending = [pendingOf("ping", "2026-09-16T10:00:10.000Z"), { ...pendingOf("ping", "2026-09-16T10:00:12.000Z"), clientId: "c-ping-2" }]
    const server = [msg("m1", "ping", ME, "2026-09-16T10:00:11.000Z")]
    expect(reconcilePending(server, pending).map((p) => p.clientId)).toEqual(["c-ping-2"])
  })

  it("never matches another sender's message to my optimistic send", () => {
    const pending = [pendingOf("hello", "2026-09-16T10:00:00.000Z")]
    const server = [msg("m1", "hello", THEM, "2026-09-16T10:00:01.000Z")]
    expect(reconcilePending(server, pending)).toHaveLength(1)
  })

  it("keeps a failed send visible so it can be retried", () => {
    const failed = pendingOf("did not send", "2026-09-16T10:00:00.000Z", "failed")
    const server = [msg("m1", "did not send", ME, "2026-09-16T10:00:01.000Z")]
    const items = mergeThread(server, [failed])
    expect(items.some((i) => i.kind === "pending" && i.pending.status === "failed")).toBe(true)
  })

  it("mints unique client ids for optimistic sends", () => {
    const a = createPending(CONV, ME, "one")
    const b = createPending(CONV, ME, "one")
    expect(a.clientId).not.toBe(b.clientId)
    expect(a).toMatchObject({ conversationId: CONV, senderId: ME, status: "sending" })
  })
})
