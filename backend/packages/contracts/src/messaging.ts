// Contracts for messaging, notifications and the real-time channel.
// Served by notification-service (see backend/API.md).
import { z } from "zod"
import type { DealStatus, Role } from "./common"

// ─── Requests ────────────────────────────────────────────────────────────────

export const MESSAGE_MAX_LENGTH = 4000
export const MESSAGE_MAX_ATTACHMENTS = 10

export const sendMessageRequest = z.object({
  body: z.string().trim().min(1, "Message can't be empty").max(MESSAGE_MAX_LENGTH, `Message must be at most ${MESSAGE_MAX_LENGTH} characters`),
  attachmentIds: z.array(z.string().uuid()).max(MESSAGE_MAX_ATTACHMENTS).optional(),
})
export type SendMessageRequest = z.infer<typeof sendMessageRequest>

export const listConversationsQuery = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})
export type ListConversationsQuery = z.infer<typeof listConversationsQuery>

export const listMessagesQuery = z.object({
  /** Message id: returns messages older than this one. */
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
})
export type ListMessagesQuery = z.infer<typeof listMessagesQuery>

export const listNotificationsQuery = z.object({
  unread: z
    .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
    .optional()
    .transform((v) => v === true || v === "true" || v === "1"),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuery>

export const markNotificationsReadRequest = z.object({
  /** Omit to mark all of the user's notifications read. */
  ids: z.array(z.string().uuid()).min(1).max(500).optional(),
})
export type MarkNotificationsReadRequest = z.infer<typeof markNotificationsReadRequest>

/** Internal (service-to-service): idempotently ensure a conversation for a deal or application. */
export const ensureConversationRequest = z
  .object({ dealId: z.string().uuid().optional(), applicationId: z.string().uuid().optional() })
  .refine((v) => !!v.dealId !== !!v.applicationId, { message: "Provide exactly one of dealId or applicationId" })
export type EnsureConversationRequest = z.infer<typeof ensureConversationRequest>

// ─── Responses ───────────────────────────────────────────────────────────────

export type MessageDTO = {
  id: string
  conversationId: string
  senderId: string
  body: string
  attachmentIds: string[]
  createdAt: string
  editedAt: string | null
}

export type ConversationCounterpart = {
  userId: string
  role: Role | null
  /** Brand company name, or the creator's / user's name. */
  name: string
  /** Brand logo, or the creator's avatar. */
  avatarUrl: string | null
  /** Creator handle (null for brands). */
  handle: string | null
}

export type ConversationSummary = {
  id: string
  subject: string
  counterpart: ConversationCounterpart | null
  deal: { id: string; title: string; status: DealStatus } | null
  application: { id: string; briefId: string; title: string; status: "APPLIED" | "SHORTLISTED" | "OFFERED" | "REJECTED" | "WITHDRAWN" } | null
  lastMessage: MessageDTO | null
  lastMessageAt: string | null
  unreadCount: number
  lastReadAt: string | null
  /** True when the linked deal was cancelled more than 30 days ago: history is visible, posting is blocked. */
  readOnly: boolean
  createdAt: string
}

export type NotificationDTO = {
  id: string
  /** The event topic that produced it, e.g. "offer.sent". */
  type: string
  title: string
  body: string
  href: string | null
  readAt: string | null
  createdAt: string
}

export type UnreadCounts = { messages: number; notifications: number }

/** List endpoints return `data: T[]` with `meta.nextCursor` (null on the last page). */
export type CursorMeta = { nextCursor: string | null }

export type EnsureConversationResponse = { id: string; created: boolean }

// ─── Socket.io protocol ──────────────────────────────────────────────────────
// Connect through the gateway: io(GATEWAY_URL, { path: "/socket.io", auth: { token: accessToken } })

export const SOCKET_PATH = "/socket.io"

export type MessageNewPayload = { conversationId: string; message: MessageDTO }
export type MessageReadPayload = { conversationId: string; userId: string; lastReadAt: string }
export type NotificationNewPayload = NotificationDTO
export type UnreadUpdatePayload = UnreadCounts
export type TypingPayload = { conversationId: string; userId: string; isTyping: boolean }
export type SocketErrorPayload = { code: "UNAUTHORIZED" | "NOT_FOUND" | "VALIDATION_ERROR" | "FORBIDDEN"; message: string; event?: string }

export type ConversationJoinRequest = { conversationId: string }
export type TypingRequest = { conversationId: string; isTyping: boolean }
export type SocketAck = { ok: true } | { ok: false; error: SocketErrorPayload }

/** Events the server emits to clients. */
export type ServerToClientEvents = {
  "message:new": (payload: MessageNewPayload) => void
  "message:read": (payload: MessageReadPayload) => void
  "notification:new": (payload: NotificationNewPayload) => void
  "unread:update": (payload: UnreadUpdatePayload) => void
  typing: (payload: TypingPayload) => void
  error: (payload: SocketErrorPayload) => void
}

/** Events clients emit to the server. The ack callback is optional. */
export type ClientToServerEvents = {
  "conversation:join": (payload: ConversationJoinRequest, ack?: (res: SocketAck) => void) => void
  "conversation:leave": (payload: ConversationJoinRequest, ack?: (res: SocketAck) => void) => void
  typing: (payload: TypingRequest) => void
}

/** Flat event-name → payload map, handy for typed listeners on the frontend. */
export type SocketEvents = {
  "message:new": MessageNewPayload
  "message:read": MessageReadPayload
  "notification:new": NotificationNewPayload
  "unread:update": UnreadUpdatePayload
  typing: TypingPayload
  error: SocketErrorPayload
  "conversation:join": ConversationJoinRequest
  "conversation:leave": ConversationJoinRequest
}
