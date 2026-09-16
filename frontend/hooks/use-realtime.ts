"use client"

import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { MessageNewPayload, NotificationNewPayload, SocketEvents, UnreadUpdatePayload } from "@hustl/contracts"
import { queryKeys } from "@/lib/api/query-keys"
import { acquireSocket, releaseSocket } from "@/lib/realtime"
import { useUiStore } from "@/store/ui"

/**
 * Connects the shared socket while enabled and keeps React Query + the UI store in sync:
 * notification:new → refetch notifications, message:new → refetch conversations/messages,
 * unread:update → authoritative unread counts.
 */
export function useRealtime({ enabled = true }: { enabled?: boolean } = {}) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!enabled) return
    const socket = acquireSocket()
    const store = useUiStore.getState

    const onNotification = (_n: NotificationNewPayload) => {
      void qc.invalidateQueries({ queryKey: queryKeys.notifications.all })
    }
    const onMessage = ({ conversationId }: MessageNewPayload) => {
      void qc.invalidateQueries({ queryKey: queryKeys.conversations.messages(conversationId) })
      void qc.invalidateQueries({ queryKey: queryKeys.conversations.list() })
      if (store().activeConversationId !== conversationId) void qc.invalidateQueries({ queryKey: queryKeys.conversations.unreadCount })
    }
    const onUnread = (counts: UnreadUpdatePayload) => {
      store().setUnread(counts)
      qc.setQueryData(queryKeys.notifications.unreadCount, { count: counts.notifications })
      qc.setQueryData(queryKeys.conversations.unreadCount, { count: counts.messages })
    }
    // Middleware rejections don't auto-reconnect; retry (a fresh token is fetched on connect).
    let retry: ReturnType<typeof setTimeout> | undefined
    const onConnectError = () => {
      clearTimeout(retry)
      retry = setTimeout(() => {
        if (!socket.connected && !socket.active) socket.connect()
      }, 10_000)
    }

    socket.on("notification:new", onNotification)
    socket.on("message:new", onMessage)
    socket.on("unread:update", onUnread)
    socket.on("connect_error", onConnectError)
    return () => {
      clearTimeout(retry)
      socket.off("notification:new", onNotification)
      socket.off("message:new", onMessage)
      socket.off("unread:update", onUnread)
      socket.off("connect_error", onConnectError)
      releaseSocket()
    }
  }, [enabled, qc])
}

type ServerEvent = Exclude<keyof SocketEvents, "conversation:join" | "conversation:leave">

/** Subscribe a component to one server event on the shared socket. */
export function useSocketEvent<E extends ServerEvent>(event: E, handler: (payload: SocketEvents[E]) => void, enabled = true) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    if (!enabled) return
    const socket = acquireSocket()
    const listener = (payload: SocketEvents[E]) => ref.current(payload)
    socket.on(event as "typing", listener as never)
    return () => {
      socket.off(event as "typing", listener as never)
      releaseSocket()
    }
  }, [event, enabled])
}

/** Join a conversation room and mark it active (suppresses unread bumps) while mounted. */
export function useConversationRoom(conversationId: string | null | undefined) {
  useEffect(() => {
    if (!conversationId) return
    const socket = acquireSocket()
    const join = () => socket.emit("conversation:join", { conversationId })
    if (socket.connected) join()
    socket.on("connect", join)
    useUiStore.getState().setActiveConversation(conversationId)
    return () => {
      socket.off("connect", join)
      socket.emit("conversation:leave", { conversationId })
      if (useUiStore.getState().activeConversationId === conversationId) useUiStore.getState().setActiveConversation(null)
      releaseSocket()
    }
  }, [conversationId])
}
