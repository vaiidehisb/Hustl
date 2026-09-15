import { AppShell } from "@/components/app/shell"
import type { NavItem } from "@/components/app/sidebar-nav"
import { db } from "@/lib/db"
import { requireBrand } from "@/lib/session"

export default async function BrandLayout({ children }: { children: React.ReactNode }) {
  const { user, brand } = await requireBrand()
  const [needsAction, newApplications] = await Promise.all([
    db.deal.count({
      where: {
        brandId: brand.id,
        OR: [
          { status: "OFFER_SENT", awaitingParty: "BRAND" },
          { status: "CONTRACT_PENDING", brandSignedAt: null },
          { status: "CONTRACT_SIGNED" },
          { milestones: { some: { status: "SUBMITTED" } } },
        ],
      },
    }),
    db.application.count({ where: { brief: { brandId: brand.id }, status: "APPLIED" } }),
  ])
  const items: NavItem[] = [
    { href: "/brand", label: "Dashboard", icon: "LayoutDashboard", exact: true },
    { href: "/brand/discover", label: "Discover creators", icon: "Sparkles" },
    { href: "/brand/briefs", label: "Briefs", icon: "FileText", badge: newApplications },
    { href: "/brand/deals", label: "Deals", icon: "Handshake", badge: needsAction },
    { href: "/brand/messages", label: "Messages", icon: "MessagesSquare" },
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
