// Pure thread reconciliation: server pages + optimistic sends → one ordered list.
// No React/DOM so it can be unit tested directly.
import type { MessageDTO } from "@hustl/contracts"

export type PendingStatus = "sending" | "failed"

export type PendingMessage = {
  /** Client-generated id; the server never sees it. */
  clientId: string
  conversationId: string
  senderId: string
  body: string
  createdAt: string
  status: PendingStatus
  error?: string
}

export type ThreadItem =
  | { key: string; kind: "sent"; message: MessageDTO }
  | { key: string; kind: "pending"; pending: PendingMessage }

/** Same author + same text landing within this window counts as the echo of an optimistic send. */
const ECHO_WINDOW_MS = 2 * 60_000

const time = (iso: string) => {
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? 0 : t
}

/** Newest-last ordering by createdAt, id as the tiebreaker (matches the server's cursor order). */
export function sortMessages(messages: MessageDTO[]): MessageDTO[] {
  return [...messages].sort((a, b) => time(a.createdAt) - time(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** Dedupe by id, keeping the last copy seen (a socket echo wins over a stale page). */
export function dedupeMessages(messages: MessageDTO[]): MessageDTO[] {
  const byId = new Map<string, MessageDTO>()
  for (const m of messages) byId.set(m.id, m)
  return sortMessages([...byId.values()])
}

/**
 * Drop optimistic messages the server has already confirmed. The POST response
 * normally removes them by clientId, but a `message:new` socket echo can arrive
 * first — match those on sender + body within a short window so the bubble
 * never appears twice.
 */
export function reconcilePending(server: MessageDTO[], pending: PendingMessage[]): PendingMessage[] {
  if (!pending.length) return pending
  const claimed = new Set<string>()
  return pending.filter((p) => {
    if (p.status === "failed") return true
    const echo = server.find(
      (m) =>
        !claimed.has(m.id) &&
        m.senderId === p.senderId &&
        m.body === p.body &&
        Math.abs(time(m.createdAt) - time(p.createdAt)) <= ECHO_WINDOW_MS,
    )
    if (echo) {
      claimed.add(echo.id)
      return false
    }
    return true
  })
}

/** The list the thread renders: confirmed messages first, then still-pending ones. */
export function mergeThread(server: MessageDTO[], pending: PendingMessage[]): ThreadItem[] {
  const messages = dedupeMessages(server)
  const live = reconcilePending(messages, pending)
  return [
    ...messages.map((message): ThreadItem => ({ key: message.id, kind: "sent", message })),
    ...live.map((p): ThreadItem => ({ key: p.clientId, kind: "pending", pending: p })),
  ]
}

/** Insert (or replace) one message into a page-flattened list without reordering the rest. */
export function upsertMessage(messages: MessageDTO[], incoming: MessageDTO): MessageDTO[] {
  return dedupeMessages([...messages, incoming])
}

export const makeClientId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`

export function createPending(conversationId: string, senderId: string, body: string): PendingMessage {
  return { clientId: makeClientId(), conversationId, senderId, body, createdAt: new Date().toISOString(), status: "sending" }
}
