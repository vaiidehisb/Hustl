"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import * as Icons from "lucide-react"
import { Menu } from "lucide-react"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Logo } from "@/components/logo"
import { cn } from "@/lib/utils"
import { useUiStore, type UnreadKind } from "@/store/ui"

// Icons are passed by name so server layouts can declare nav items.
// `liveBadge` shows a realtime unread count from the UI store instead of a static `badge`.
export type NavItem = { href: string; label: string; icon: keyof typeof Icons; badge?: number; liveBadge?: UnreadKind; exact?: boolean }

function NavLinks({ items: rawItems, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname()
  const unread = useUiStore((s) => s.unread)
  const items = rawItems.map((i) => (i.liveBadge ? { ...i, badge: unread[i.liveBadge] } : i))
  return (
    <nav className="flex flex-col gap-0.5 px-3 py-2">
      {items.map((item) => {
        const Icon = Icons[item.icon] as Icons.LucideIcon
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "group flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
            {item.label}
            {!!item.badge && (
              <span className="ml-auto rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 text-primary-foreground tabular-nums">{item.badge}</span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}

export function SidebarNav({ items }: { items: NavItem[] }) {
  return <NavLinks items={items} />
}

export function MobileNav({ items, portalLabel }: { items: NavItem[]; portalLabel: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="grid size-10 place-items-center rounded-lg border lg:hidden" aria-label="Open menu">
        <Menu className="size-4" />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 max-w-[85vw] overflow-y-auto bg-sidebar p-0">
        <SheetTitle className="flex h-16 items-center gap-2 px-5">
          <Logo size="sm" />
          <span className="font-display text-lg font-extrabold">hustl.</span>
          <span className="text-xs font-medium text-muted-foreground">{portalLabel}</span>
        </SheetTitle>
        <NavLinks items={items} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
