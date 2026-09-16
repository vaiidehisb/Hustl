"use client"
// Left pane: conversations from GET /conversations (cursor-paginated), with search.
import { Search } from "lucide-react"
import type { ConversationSummary } from "@hustl/contracts"
import { Avatar } from "@/components/app/ui"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"

export const conversationTitle = (c: ConversationSummary) => c.counterpart?.name ?? c.subject ?? "Conversation"
export const conversationContext = (c: ConversationSummary) => c.deal?.title ?? c.application?.title ?? null
export const conversationStatus = (c: ConversationSummary) => c.deal?.status ?? c.application?.status ?? null

export function matchesQuery(c: ConversationSummary, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [conversationTitle(c), conversationContext(c), c.counterpart?.handle, c.lastMessage?.body].some((v) => v?.toLowerCase().includes(q))
}

export function ConversationList({
  conversations,
  activeId,
  query,
  onQueryChange,
  onSelect,
  loading,
  hasMore,
  onLoadMore,
  loadingMore,
}: {
  conversations: ConversationSummary[]
  activeId: string | null
  query: string
  onQueryChange: (q: string) => void
  onSelect: (id: string) => void
  loading: boolean
  hasMore: boolean
  onLoadMore: () => void
  loadingMore: boolean
}) {
  return (
    <>
      <div className="border-b p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => onQueryChange(e.target.value)} placeholder="Search conversations" className="pl-9" aria-label="Search conversations" />
        </div>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {loading &&
          Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="flex gap-3 px-4 py-3.5">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </li>
          ))}

        {!loading &&
          conversations.map((c) => {
            const name = conversationTitle(c)
            const context = conversationContext(c)
            const active = c.id === activeId
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn("flex w-full gap-3 border-b px-4 py-3.5 text-left transition-colors hover:bg-muted/50", active && "bg-accent/70 hover:bg-accent/70")}
                >
                  <Avatar name={name} src={c.counterpart?.avatarUrl} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={cn("truncate text-sm", c.unreadCount > 0 ? "font-semibold" : "font-medium")}>{name}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{c.lastMessageAt ? timeAgo(c.lastMessageAt) : ""}</span>
                    </div>
                    {context && <p className="truncate text-xs text-muted-foreground">{context}</p>}
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className={cn("truncate text-xs", c.unreadCount > 0 ? "font-medium text-foreground" : "text-muted-foreground")}>
                        {c.lastMessage?.body ?? "No messages yet"}
                      </p>
                      {c.unreadCount > 0 && (
                        <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                          {c.unreadCount > 99 ? "99+" : c.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            )
          })}

        {!loading && hasMore && (
          <li className="p-3">
            <Button variant="ghost" size="sm" className="w-full" disabled={loadingMore} onClick={onLoadMore}>
              {loadingMore ? "Loading…" : "Load older conversations"}
            </Button>
          </li>
        )}
      </ul>
    </>
  )
}
