"use client"
// Shared two-pane inbox used by /brand/messages and /creator/messages.
// URL state: ?c=<conversationId>. On mobile the list and the thread swap.
import { useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { MessagesSquare } from "lucide-react"
import type { ConversationSummary, CursorMeta } from "@hustl/contracts"
import { ApiErrorState } from "@/components/app/states"
import { EmptyState, PageHeader } from "@/components/app/ui"
import { browserFetch, browserFetchWithMeta } from "@/lib/api/browser"
import { queryKeys } from "@/lib/api/query-keys"
import { cn } from "@/lib/utils"
import { ConversationList, matchesQuery } from "./conversation-list"
import { Thread } from "./thread"

type Page = { data: ConversationSummary[]; meta: CursorMeta }

export function Inbox({
  role,
  currentUserId,
  initialConversationId = null,
  dealLookupFailed = false,
}: {
  role: "BRAND" | "CREATOR"
  currentUserId: string
  /** Resolved server-side from `?deal=<dealId>`. */
  initialConversationId?: string | null
  dealLookupFailed?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [query, setQuery] = useState("")

  const activeId = params.get("c") ?? initialConversationId

  const list = useInfiniteQuery<Page>({
    queryKey: queryKeys.conversations.list(),
    queryFn: ({ pageParam, signal }) =>
      browserFetchWithMeta<ConversationSummary[], CursorMeta>("/conversations", { query: { limit: 20, ...(pageParam ? { cursor: pageParam as string } : {}) }, signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  })

  const conversations = useMemo(() => (list.data?.pages ?? []).flatMap((p) => p.data), [list.data])
  const filtered = useMemo(() => conversations.filter((c) => matchesQuery(c, query)), [conversations, query])
  const fromList = conversations.find((c) => c.id === activeId) ?? null

  // Deep link to a conversation that isn't on a loaded page yet.
  const detail = useQuery({
    queryKey: queryKeys.conversations.detail(activeId ?? ""),
    queryFn: ({ signal }) => browserFetch<ConversationSummary>(`/conversations/${encodeURIComponent(activeId!)}`, { signal }),
    enabled: !!activeId && !fromList,
  })
  const active = fromList ?? detail.data ?? null

  const select = (id: string) => router.replace(`${pathname}?c=${id}`, { scroll: false })
  const back = () => router.replace(pathname, { scroll: false })

  const dealBase = role === "BRAND" ? "/brand/deals" : "/creator/deals"

  return (
    <div>
      <PageHeader title="Messages" description="Every conversation with the deal or application it belongs to, so context never gets lost." />

      {dealLookupFailed && (
        <p className="mb-4 rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning">
          We couldn't find a conversation for that deal yet. It opens automatically once the offer has been delivered.
        </p>
      )}

      {list.isError ? (
        <ApiErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.isPending && conversations.length === 0 ? (
        <EmptyState icon={MessagesSquare} title="No conversations yet" description="Threads open automatically when an offer is sent or an application is shortlisted." />
      ) : (
        <div className="flex h-[calc(100dvh-17rem)] min-h-[24rem] overflow-hidden rounded-xl border bg-card shadow-xs sm:h-[calc(100dvh-13rem)] sm:min-h-[32rem]">
          <aside className={cn("flex w-full flex-col border-r md:w-80 lg:w-96", activeId && "hidden md:flex")}>
            <ConversationList
              conversations={filtered}
              activeId={activeId}
              query={query}
              onQueryChange={setQuery}
              onSelect={select}
              loading={list.isPending}
              hasMore={!!list.hasNextPage}
              onLoadMore={() => void list.fetchNextPage()}
              loadingMore={list.isFetchingNextPage}
            />
            {!list.isPending && filtered.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No conversations match “{query}”.</p>}
          </aside>

          <section className={cn("flex min-w-0 flex-1 flex-col", !activeId && "hidden md:flex")}>
            {active ? (
              <Thread
                key={active.id}
                conversation={active}
                currentUserId={currentUserId}
                onBack={back}
                dealHref={active.deal ? `${dealBase}/${active.deal.id}` : null}
              />
            ) : detail.isError ? (
              <div className="grid flex-1 place-items-center p-6">
                <ApiErrorState error={detail.error} compact onRetry={() => void detail.refetch()} />
              </div>
            ) : (
              <div className="grid flex-1 place-items-center p-6 text-center text-sm text-muted-foreground">
                {activeId ? "Loading conversation…" : "Pick a conversation to start reading."}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
