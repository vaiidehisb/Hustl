"use client"

import { useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Bell, CheckCheck } from "lucide-react"
import type { NotificationDTO } from "@hustl/contracts"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiErrorState } from "@/components/app/states"
import { useUnreadCounts } from "@/hooks/use-unread-counts"
import { browserApi } from "@/lib/api/browser"
import { friendlyMessage } from "@/lib/api/errors"
import { queryKeys } from "@/lib/api/query-keys"
import { timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useUiStore } from "@/store/ui"

export function NotificationBell() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const unread = useUnreadCounts().notifications
  const setUnread = useUiStore((s) => s.setUnread)

  const list = useQuery({
    queryKey: queryKeys.notifications.list(),
    queryFn: async ({ signal }) => (await browserApi.notifications.list({ limit: 15 }, { signal })).data,
    enabled: open,
    staleTime: 15_000,
  })

  const markRead = useMutation({
    mutationFn: (ids?: string[]) => browserApi.notifications.markRead(ids),
    onMutate: (ids) => {
      // Optimistic: mark rows read in the cached list.
      const now = new Date().toISOString()
      qc.setQueryData<NotificationDTO[]>(queryKeys.notifications.list(), (rows) =>
        rows?.map((n) => (!ids || ids.includes(n.id) ? { ...n, readAt: n.readAt ?? now } : n)),
      )
    },
    onSuccess: (res) => {
      setUnread({ notifications: res.unreadCount })
      qc.setQueryData(queryKeys.notifications.unreadCount, { count: res.unreadCount })
    },
    onError: (err) => {
      toast.error(friendlyMessage(err))
      void qc.invalidateQueries({ queryKey: queryKeys.notifications.all })
    },
  })

  const items = list.data ?? []

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="relative grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <button
              disabled={markRead.isPending}
              onClick={() => markRead.mutate(undefined)}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {list.isPending ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : list.isError ? (
            <ApiErrorState compact error={list.error} onRetry={() => void list.refetch()} />
          ) : items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
          ) : (
            items.map((n) => {
              const read = Boolean(n.readAt)
              const onOpen = () => {
                if (!read) markRead.mutate([n.id])
                if (n.href) setOpen(false)
              }
              const inner = (
                <div className={cn("flex gap-3 border-b px-4 py-3 text-left last:border-0 hover:bg-muted/60", !read && "bg-accent/40")}>
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", read ? "bg-transparent" : "bg-primary")} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug">{n.title}</p>
                    {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</p>
                  </div>
                </div>
              )
              return n.href ? (
                <Link key={n.id} href={n.href} onClick={onOpen} className="block">
                  {inner}
                </Link>
              ) : (
                <button key={n.id} type="button" onClick={onOpen} className="block w-full">
                  {inner}
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
