import { AppShell } from "@/components/app/shell"
import type { NavItem } from "@/components/app/sidebar-nav"
import { requireRole } from "@/lib/auth/session"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("ADMIN", "/admin")
  const items: NavItem[] = [{ href: "/admin", label: "Trust & safety", icon: "ShieldCheck", exact: true }]
  return (
    <AppShell user={user} items={items} portalLabel="Admin">
      {children}
    </AppShell>
  )
}
