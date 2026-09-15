import { AppShell } from "@/components/app/shell"
import type { NavItem } from "@/components/app/sidebar-nav"
import { requireRole } from "@/lib/auth/session"

export default async function BrandLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("BRAND", "/brand")
  // TODO(portal-rewire): "needs action" deal / new-application badges from the deal API.
  const items: NavItem[] = [
    { href: "/brand", label: "Dashboard", icon: "LayoutDashboard", exact: true },
    { href: "/brand/discover", label: "Discover creators", icon: "Sparkles" },
    { href: "/brand/briefs", label: "Briefs", icon: "FileText" },
    { href: "/brand/deals", label: "Deals", icon: "Handshake" },
    { href: "/brand/messages", label: "Messages", icon: "MessagesSquare", liveBadge: "messages" },
    { href: "/brand/payments", label: "Payments & escrow", icon: "Wallet" },
    { href: "/brand/analytics", label: "Analytics", icon: "ChartNoAxesCombined" },
    { href: "/brand/settings", label: "Settings", icon: "Settings" },
  ]
  return (
    <AppShell user={user} items={items} portalLabel="Brand">
      {children}
    </AppShell>
  )
}
