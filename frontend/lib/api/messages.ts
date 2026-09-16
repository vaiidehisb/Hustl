import type { ConversationSummary, CursorMeta, ListConversationsQuery, ListMessagesQuery, MessageDTO, SendMessageRequest } from "@hustl/contracts"
import type { UnreadCount } from "./types"
import { seg, type CallOptions, type Requester } from "./core"

export const messagesApi = (r: Requester) => ({
  /** GET /conversations — with last message + unread count; `meta.nextCursor`. */
  conversations: (query?: Partial<ListConversationsQuery>, o?: CallOptions) => r.withMeta<ConversationSummary[], CursorMeta>("/conversations", { ...o, query }),
  /** GET /conversations/:id */
  conversation: (id: string, o?: CallOptions) => r<ConversationSummary>(`/conversations/${seg(id)}`, o),
  /** GET /conversations/:id/messages?before */
  list: (conversationId: string, query?: Partial<ListMessagesQuery>, o?: CallOptions) =>
    r.withMeta<MessageDTO[], CursorMeta>(`/conversations/${seg(conversationId)}/messages`, { ...o, query }),
  /** POST /conversations/:id/messages */
  send: (conversationId: string, body: SendMessageRequest, o?: CallOptions) =>
    r<MessageDTO>(`/conversations/${seg(conversationId)}/messages`, { ...o, method: "POST", body }),
  /** POST /conversations/:id/read */
  markRead: (conversationId: string, o?: CallOptions) => r<unknown>(`/conversations/${seg(conversationId)}/read`, { ...o, method: "POST" }),
  /** GET /conversations/unread-count → `{ count }` */
  unreadCount: (o?: CallOptions) => r<UnreadCount>("/conversations/unread-count", o),
})
