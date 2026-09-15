import type { CursorMeta, NotificationDTO } from "@hustl/contracts"
import type { MarkNotificationsReadResponse, UnreadCount } from "./types"
import type { CallOptions, Requester } from "./core"

export const notificationsApi = (r: Requester) => ({
  /** GET /notifications?unread&cursor&limit — `meta.nextCursor`. */
  list: (query?: { unread?: boolean; cursor?: string; limit?: number }, o?: CallOptions) =>
    r.withMeta<NotificationDTO[], CursorMeta>("/notifications", { ...o, query }),
  /** POST /notifications/read — omit ids to mark all read. */
  markRead: (ids?: string[], o?: CallOptions) =>
    r<MarkNotificationsReadResponse>("/notifications/read", { ...o, method: "POST", body: ids?.length ? { ids } : {} }),
  /** GET /notifications/unread-count → `{ count }` */
  unreadCount: (o?: CallOptions) => r<UnreadCount>("/notifications/unread-count", o),
})
