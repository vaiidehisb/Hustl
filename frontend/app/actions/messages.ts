"use server"
// Messaging mutations + the deal → conversation lookup used by /messages?deal=…
import type { ConversationSummary, CursorMeta, MessageDTO } from "@hustl/contracts"
import { apiFetch, apiFetchWithMeta } from "@/lib/api/client"
import { apiAction, type ApiActionResult } from "./api-result"

const seg = (v: string) => encodeURIComponent(v)

/** POST /conversations/:id/messages */
export async function sendMessageAction(conversationId: string, body: string, attachmentIds?: string[]): Promise<ApiActionResult<MessageDTO>> {
  return apiAction(() =>
    apiFetch<MessageDTO>(`/conversations/${seg(conversationId)}/messages`, {
      method: "POST",
      body: { body, ...(attachmentIds?.length ? { attachmentIds } : {}) },
    }),
  )
}

/** POST /conversations/:id/read */
export async function markConversationReadAction(conversationId: string): Promise<ApiActionResult<{ conversationId: string; lastReadAt: string; unreadCount: number }>> {
  return apiAction(() => apiFetch<{ conversationId: string; lastReadAt: string; unreadCount: number }>(`/conversations/${seg(conversationId)}/read`, { method: "POST" }))
}


/** Resolve a deal to its conversation id (threads are created on `offer.sent`). */
export async function conversationForDealAction(dealId: string): Promise<string | null> {
  try {
    const { data } = await apiFetchWithMeta<ConversationSummary[], CursorMeta>("/conversations", { query: { limit: 1, dealId } })
    return data[0]?.id ?? null
  } catch {
    return null
  }
}
