import Link from "next/link"
import { db } from "@/lib/db"
import { Logo } from "@/components/logo"
import { SidebarNav, MobileNav, type NavItem } from "./sidebar-nav"
import { NotificationBell } from "./notification-bell"
import { UserMenu } from "./user-menu"

export async function AppShell({
  user,
  items,
  portalLabel,
  children,
}: {
  user: { id: string; name: string; email: string; image: string | null }
  items: NavItem[]
  portalLabel: string
  children: React.ReactNode
}) {
  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 12,
  })
  const unread = await db.notification.count({ where: { userId: user.id, read: false } })

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
            <NotificationBell
              unread={unread}
              items={notifications.map((n) => ({ id: n.id, title: n.title, body: n.body, href: n.href, read: n.read, createdAt: n.createdAt.toISOString() }))}
            />
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
