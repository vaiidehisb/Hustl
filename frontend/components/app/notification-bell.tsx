"use client"

import Link from "next/link"
import { useTransition } from "react"
import { Bell, CheckCheck } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { markNotificationsRead } from "@/app/actions/notifications"
import { timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"

type Item = { id: string; title: string; body: string; href: string | null; read: boolean; createdAt: string }

export function NotificationBell({ unread, items }: { unread: number; items: Item[] }) {
  const [pending, start] = useTransition()
  return (
    <Popover>
      <PopoverTrigger className="relative grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Notifications">
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
              disabled={pending}
              onClick={() => start(() => markNotificationsRead())}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">You're all caught up.</p>
          ) : (
            items.map((n) => {
              const inner = (
                <div className={cn("flex gap-3 border-b px-4 py-3 last:border-0 hover:bg-muted/60", !n.read && "bg-accent/40")}>
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug">{n.title}</p>
                    {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</p>
                  </div>
                </div>
              )
              return n.href ? (
                <Link key={n.id} href={n.href}>
                  {inner}
                </Link>
              ) : (
                <div key={n.id}>{inner}</div>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
