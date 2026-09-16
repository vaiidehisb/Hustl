"use server"

import { notifications } from "@/lib/api"
import { isApiError } from "@/lib/api/errors"

/** Server-action variant (the bell uses React Query directly). Omit ids to mark all read. */
export async function markNotificationsRead(ids?: string[]) {
  try {
    const res = await notifications.markRead(ids)
    return { ok: true as const, unreadCount: res.unreadCount }
  } catch (err) {
    return { ok: false as const, error: isApiError(err) ? err.message : "Could not update notifications" }
  }
}
