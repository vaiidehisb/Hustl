import { AppShell } from "@/components/app/shell"
import type { NavItem } from "@/components/app/sidebar-nav"
import { requireRole } from "@/lib/auth/session"
import { getCreatorBadges } from "./data"

export default async function CreatorLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("CREATOR", "/creator")
  // Badges are best-effort: a failing deal-service must not take the portal down.
  const { offers, revisions } = await getCreatorBadges()

  const items: NavItem[] = [
    // Revisions surface on the dashboard's next-moves queue; offers on the deals list.
    { href: "/creator", label: "Dashboard", icon: "LayoutDashboard", exact: true, ...(revisions ? { badge: revisions } : {}) },
    { href: "/creator/marketplace", label: "Brand marketplace", icon: "Store" },
    { href: "/creator/applications", label: "My applications", icon: "Send" },
    { href: "/creator/deals", label: "Offers & deals", icon: "Handshake", ...(offers ? { badge: offers } : {}) },
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
