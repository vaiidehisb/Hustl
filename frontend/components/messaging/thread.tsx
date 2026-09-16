"use client"
// Right pane: one conversation. Infinite scroll up via `before`, optimistic
// sends with a retryable failure state, Socket.io message/read/typing events.
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query"
import { ArrowLeft, Check, CheckCheck, Loader2, RotateCw, SendHorizontal, TriangleAlert } from "lucide-react"
import type { ConversationSummary, CursorMeta, MessageDTO, MessageNewPayload, MessageReadPayload, TypingPayload } from "@hustl/contracts"
import { MESSAGE_MAX_LENGTH } from "@hustl/contracts"
import { Avatar } from "@/components/app/ui"
import { ApiErrorState } from "@/components/app/states"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { browserFetchWithMeta } from "@/lib/api/browser"
import { queryKeys } from "@/lib/api/query-keys"
import { getSocket } from "@/lib/realtime"
import { useConversationRoom, useSocketEvent } from "@/hooks/use-realtime"
import { markConversationReadAction, sendMessageAction } from "@/app/actions/messages"
import { actionErrorMessage } from "@/components/deals/use-deal-action"
import { timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"
import { conversationContext, conversationTitle } from "./conversation-list"
import { createPending, mergeThread, upsertMessage, type PendingMessage } from "./reconcile"

type Page = { data: MessageDTO[]; meta: CursorMeta }
const PAGE_SIZE = 30
const TYPING_IDLE_MS = 2500

export function Thread({ conversation, currentUserId, onBack, dealHref }: { conversation: ConversationSummary; currentUserId: string; onBack: () => void; dealHref: string | null }) {
  const id = conversation.id
  const qc = useQueryClient()
  const key = queryKeys.conversations.messages(id)
  const scroller = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const [pending, setPending] = useState<PendingMessage[]>([])
  const [draft, setDraft] = useState("")
  const [counterpartReadAt, setCounterpartReadAt] = useState<string | null>(null)
  const [typing, setTyping] = useState(false)

  useConversationRoom(id)

  const query = useInfiniteQuery<Page>({
    queryKey: key,
    queryFn: ({ pageParam, signal }) =>
      browserFetchWithMeta<MessageDTO[], CursorMeta>(`/conversations/${encodeURIComponent(id)}/messages`, {
        query: { limit: PAGE_SIZE, ...(pageParam ? { before: pageParam as string } : {}) },
        signal,
      }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  })

  const serverMessages = (query.data?.pages ?? []).flatMap((p) => p.data)
  const items = mergeThread(serverMessages, pending)

  const insertMessage = useCallback(
    (message: MessageDTO) => {
      qc.setQueryData<InfiniteData<Page>>(key, (old) =>
        old ? { ...old, pages: old.pages.map((p, i) => (i === 0 ? { ...p, data: upsertMessage(p.data, message) } : p)) } : old,
      )
    },
    [qc, key],
  )

  const markRead = useCallback(() => {
    void markConversationReadAction(id).then(() => {
      void qc.invalidateQueries({ queryKey: queryKeys.conversations.list() })
      void qc.invalidateQueries({ queryKey: queryKeys.conversations.unreadCount })
    })
  }, [id, qc])

  // Mark read on open and whenever the tab regains focus.
  useEffect(() => {
    markRead()
    const onFocus = () => document.visibilityState === "visible" && markRead()
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onFocus)
    return () => {
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onFocus)
    }
  }, [markRead])

  useSocketEvent("message:new", (p: MessageNewPayload) => {
    if (p.conversationId !== id) return
    insertMessage(p.message)
    if (p.message.senderId !== currentUserId && document.visibilityState === "visible") markRead()
  })

  useSocketEvent("message:read", (p: MessageReadPayload) => {
    if (p.conversationId === id && p.userId !== currentUserId) setCounterpartReadAt(p.lastReadAt)
  })

  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useSocketEvent("typing", (p: TypingPayload) => {
    if (p.conversationId !== id || p.userId === currentUserId) return
    setTyping(p.isTyping)
    clearTimeout(typingTimer.current)
    if (p.isTyping) typingTimer.current = setTimeout(() => setTyping(false), TYPING_IDLE_MS * 2)
  })

  // ── Scrolling ──
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = scroller.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  useEffect(() => {
    if (atBottom.current) scrollToBottom()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, id])

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (el.scrollTop < 80 && query.hasNextPage && !query.isFetchingNextPage) {
      const before = el.scrollHeight
      void query.fetchNextPage().then(() => {
        requestAnimationFrame(() => {
          if (scroller.current) scroller.current.scrollTop += scroller.current.scrollHeight - before
        })
      })
    }
  }

  // ── Sending ──
  const emitTyping = useRef<ReturnType<typeof setTimeout>>(undefined)
  const onDraftChange = (value: string) => {
    setDraft(value)
    const socket = getSocket()
    if (!socket) return
    socket.emit("typing", { conversationId: id, isTyping: value.length > 0 })
    clearTimeout(emitTyping.current)
    emitTyping.current = setTimeout(() => socket.emit("typing", { conversationId: id, isTyping: false }), TYPING_IDLE_MS)
  }

  const deliver = useCallback(
    async (message: PendingMessage) => {
      const res = await sendMessageAction(id, message.body)
      if (res.ok) {
        insertMessage(res.data)
        setPending((list) => list.filter((p) => p.clientId !== message.clientId))
        void qc.invalidateQueries({ queryKey: queryKeys.conversations.list() })
      } else {
        setPending((list) => list.map((p) => (p.clientId === message.clientId ? { ...p, status: "failed", error: actionErrorMessage(res) } : p)))
      }
    },
    [id, insertMessage, qc],
  )

  const send = () => {
    const body = draft.trim()
    if (!body || conversation.readOnly) return
    const message = createPending(id, currentUserId, body)
    setPending((list) => [...list, message])
    setDraft("")
    atBottom.current = true
    getSocket()?.emit("typing", { conversationId: id, isTyping: false })
    void deliver(message)
  }

  const retry = (clientId: string) => {
    const message = pending.find((p) => p.clientId === clientId)
    if (!message) return
    const retried: PendingMessage = { ...message, status: "sending", error: undefined }
    setPending((list) => list.map((p) => (p.clientId === clientId ? retried : p)))
    void deliver(retried)
  }

  const name = conversationTitle(conversation)
  const context = conversationContext(conversation)
  const lastMine = [...items].reverse().find((i) => i.kind === "sent" && i.message.senderId === currentUserId)
  const seen = lastMine?.kind === "sent" && counterpartReadAt ? new Date(lastMine.message.createdAt) <= new Date(counterpartReadAt) : false

  return (
    <>
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack} aria-label="Back to conversations">
          <ArrowLeft className="size-4" />
        </Button>
        <Avatar name={name} src={conversation.counterpart?.avatarUrl} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{name}</div>
          <div className="truncate text-xs text-muted-foreground">{typing ? "typing…" : (context ?? conversation.counterpart?.handle ?? "")}</div>
        </div>
        {dealHref && (
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href={dealHref}>Open deal</Link>
          </Button>
        )}
      </header>

      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {query.isPending && (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className={cn("h-12 w-2/3 rounded-2xl", i % 2 ? "ml-auto" : "")} />
            ))}
          </div>
        )}

        {query.isError && <ApiErrorState error={query.error} compact onRetry={() => void query.refetch()} />}

        {query.isFetchingNextPage && (
          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Loading older messages
          </p>
        )}

        {!query.isPending && !query.isError && items.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No messages yet — say hello and align on the brief.</p>
        )}

        {items.map((item) => {
          const body = item.kind === "sent" ? item.message.body : item.pending.body
          const mine = item.kind === "sent" ? item.message.senderId === currentUserId : true
          const failed = item.kind === "pending" && item.pending.status === "failed"
          return (
            <div key={item.key} className={cn("flex items-end gap-2.5", mine && "flex-row-reverse")}>
              {!mine && <Avatar name={name} src={conversation.counterpart?.avatarUrl} size={28} />}
              <div className={cn("max-w-[78%]", mine && "text-right")}>
                <div
                  className={cn(
                    // `break-words` so a pasted deliverable URL can't widen the pane.
                    "inline-block max-w-full overflow-hidden break-words whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-left text-sm",
                    mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted",
                    item.kind === "pending" && !failed && "opacity-70",
                    failed && "bg-danger-soft text-destructive",
                  )}
                >
                  {body}
                </div>
                <div className="mt-1 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
                  {item.kind === "pending" ? (
                    failed ? (
                      <>
                        <TriangleAlert className="size-3" /> {item.pending.error ?? "Not sent"}
                        <button type="button" onClick={() => retry(item.pending.clientId)} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                          <RotateCw className="size-3" /> Retry
                        </button>
                      </>
                    ) : (
                      <>
                        <Loader2 className="size-3 animate-spin" /> Sending…
                      </>
                    )
                  ) : (
                    <>
                      <span>{timeAgo(item.message.createdAt)}</span>
                      {mine && item.key === lastMine?.key && (seen ? <CheckCheck className="size-3.5 text-primary" /> : <Check className="size-3.5" />)}
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {conversation.readOnly ? (
        <p className="border-t px-4 py-3 text-center text-xs text-muted-foreground">This conversation is read-only because the deal was cancelled more than 30 days ago.</p>
      ) : (
        <div className="flex items-end gap-2 border-t p-3">
          <Textarea
            value={draft}
            onChange={(e) => onDraftChange(e.target.value.slice(0, MESSAGE_MAX_LENGTH))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            rows={1}
            placeholder="Write a message…  (Enter to send, Shift+Enter for a new line)"
            className="min-h-10 resize-none"
            aria-label="Message"
          />
          <Button size="icon" onClick={send} disabled={!draft.trim()} aria-label="Send message">
            <SendHorizontal className="size-4" />
          </Button>
        </div>
      )}
    </>
  )
}
