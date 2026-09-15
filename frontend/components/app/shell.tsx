import Link from "next/link"
import { Logo } from "@/components/logo"
import type { SessionUser } from "@/lib/auth/refresh"
import { SidebarNav, MobileNav, type NavItem } from "./sidebar-nav"
import { NotificationBell } from "./notification-bell"
import { UserMenu } from "./user-menu"

export function AppShell({
  user,
  items,
  portalLabel,
  children,
}: {
  user: Pick<SessionUser, "name" | "email" | "image">
  items: NavItem[]
  portalLabel: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r bg-sidebar lg:flex">
        <Link href="/" className="flex h-16 items-center gap-2 px-5">
          <Logo size="sm" />
          <span className="font-display text-lg font-extrabold tracking-tight">hustl.</span>
          <span className="ml-auto rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-foreground">
            {portalLabel}
          </span>
        </Link>
        <SidebarNav items={items} />
        <div className="mt-auto border-t p-3">
          <UserMenu user={user} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <MobileNav items={items} portalLabel={portalLabel} />
          <div className="ml-auto flex items-center gap-1.5">
            <NotificationBell />
            <div className="lg:hidden">
              <UserMenu user={user} compact />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
