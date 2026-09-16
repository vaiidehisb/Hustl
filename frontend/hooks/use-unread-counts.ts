"use client"

import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { browserApi } from "@/lib/api/browser"
import { queryKeys } from "@/lib/api/query-keys"
import { useUiStore } from "@/store/ui"

/** Seeds the UI store's unread counts from the API; realtime `unread:update` keeps them live. */
export function useUnreadCounts(enabled = true) {
  const setUnread = useUiStore((s) => s.setUnread)

  const notifications = useQuery({
    queryKey: queryKeys.notifications.unreadCount,
    queryFn: ({ signal }) => browserApi.notifications.unreadCount({ signal }),
    enabled,
    refetchInterval: 5 * 60_000,
  })
  const messages = useQuery({
    queryKey: queryKeys.conversations.unreadCount,
    queryFn: ({ signal }) => browserApi.messages.unreadCount({ signal }),
    enabled,
    refetchInterval: 5 * 60_000,
  })

  useEffect(() => {
    if (notifications.data) setUnread({ notifications: notifications.data.count })
  }, [notifications.data, setUnread])
  useEffect(() => {
    if (messages.data) setUnread({ messages: messages.data.count })
  }, [messages.data, setUnread])

  return useUiStore((s) => s.unread)
}
