import { AppShell } from "@/components/app/shell"
import type { NavItem } from "@/components/app/sidebar-nav"
import { db } from "@/lib/db"
import { requireCreator } from "@/lib/session"

export default async function CreatorLayout({ children }: { children: React.ReactNode }) {
  const { user, creator } = await requireCreator()
  const needsAction = await db.deal.count({
    where: {
      creatorId: creator.id,
      OR: [
        { status: "OFFER_SENT", awaitingParty: "CREATOR" },
        { status: "CONTRACT_PENDING", creatorSignedAt: null },
        { status: "IN_PROGRESS", milestones: { some: { status: "REVISION_REQUESTED" } } },
      ],
    },
  })
  const items: NavItem[] = [
    { href: "/creator", label: "Dashboard", icon: "LayoutDashboard", exact: true },
    { href: "/creator/marketplace", label: "Brand marketplace", icon: "Store" },
    { href: "/creator/applications", label: "My applications", icon: "Send" },
    { href: "/creator/deals", label: "Offers & deals", icon: "Handshake", badge: needsAction },
    { href: "/creator/messages", label: "Messages", icon: "MessagesSquare" },
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
