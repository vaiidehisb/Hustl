import { AppShell } from "@/components/app/shell"
import type { NavItem } from "@/components/app/sidebar-nav"
import { requireRole } from "@/lib/auth/session"

export default async function CreatorLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("CREATOR", "/creator")
  // TODO(portal-rewire): "needs action" offers badge from the deal API.
  const items: NavItem[] = [
    { href: "/creator", label: "Dashboard", icon: "LayoutDashboard", exact: true },
    { href: "/creator/marketplace", label: "Brand marketplace", icon: "Store" },
    { href: "/creator/applications", label: "My applications", icon: "Send" },
    { href: "/creator/deals", label: "Offers & deals", icon: "Handshake" },
    { href: "/creator/messages", label: "Messages", icon: "MessagesSquare", liveBadge: "messages" },
    { href: "/creator/earnings", label: "Earnings", icon: "Wallet" },
    { href: "/creator/analytics", label: "My analytics", icon: "ChartNoAxesCombined" },
    { href: "/creator/profile", label: "Profile builder", icon: "UserRoundPen" },
    { href: "/creator/settings", label: "Connect socials", icon: "Link2" },
  ]
  return (
    <AppShell user={user} items={items} portalLabel="Creator">
      {children}
    </AppShell>
  )
}
