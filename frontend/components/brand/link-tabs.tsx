// URL-driven tabs (server-safe): each tab is a link that sets a search param,
// so the active view is shareable and survives refresh.

import Link from "next/link"
import { cn } from "@/lib/utils"

export type LinkTab = { value: string; label: string; count?: number; href: string }

export function LinkTabs({ tabs, active, className }: { tabs: LinkTab[]; active: string; className?: string }) {
  return (
    <div className={cn("-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0", className)}>
      <nav className="inline-flex min-w-full gap-1 border-b sm:min-w-0" aria-label="Tabs">
        {tabs.map((t) => {
          const on = t.value === active
          return (
            <Link
              key={t.value}
              href={t.href}
              scroll={false}
              aria-current={on ? "page" : undefined}
              className={cn(
                "relative -mb-px inline-flex items-center gap-2 border-b-2 px-3 pt-1 pb-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                on ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {t.count !== undefined && (
                <span className={cn("rounded-full px-1.5 py-px text-[11px] tabular-nums", on ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                  {t.count}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
