import Link from "next/link"
import { ArrowRight, Handshake, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, EmptyState, PageHeader, StatusBadge } from "@/components/app/ui"
import { LinkTabs } from "@/components/brand/link-tabs"
import { creatorInclude } from "@/components/brand/data"
import { nextStep, PAYMENT_MODE_LABEL } from "@/components/brand/helpers"
import { db } from "@/lib/db"
import { inr, timeAgo } from "@/lib/format"
import { requireBrand } from "@/lib/session"
import { cn } from "@/lib/utils"

export const metadata = { title: "Deals · hustl." }

const TABS: { value: string; label: string; statuses?: string[] }[] = [
  { value: "all", label: "All" },
  { value: "negotiating", label: "Negotiating", statuses: ["OFFER_SENT", "CONTRACT_PENDING", "CONTRACT_SIGNED"] },
  { value: "active", label: "Active", statuses: ["FUNDED", "IN_PROGRESS"] },
  { value: "completed", label: "Completed", statuses: ["COMPLETED"] },
  { value: "closed", label: "Disputed & cancelled", statuses: ["DISPUTED", "CANCELLED"] },
]

export default async function BrandDealsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { brand } = await requireBrand()
  const { tab: rawTab } = await searchParams
  const tab = TABS.find((t) => t.value === rawTab) ?? TABS[0]

  const deals = await db.deal.findMany({
    where: { brandId: brand.id },
    include: { creator: { include: creatorInclude }, milestones: { select: { status: true } } },
    orderBy: { updatedAt: "desc" },
  })
  const inTab = (t: (typeof TABS)[number]) => (t.statuses ? deals.filter((d) => t.statuses!.includes(d.status)) : deals)
  const rows = inTab(tab)
    .map((d) => ({ ...d, step: nextStep(d) }))
    // brand's move first, then most recently updated
    .sort((a, b) => Number(b.step.yourMove) - Number(a.step.yourMove) || b.updatedAt.getTime() - a.updatedAt.getTime())

  return (
    <div>
      <PageHeader
        title="Deals"
        description="Every collaboration from offer to payout. Deals where it's your move are pinned to the top."
        actions={
          <Button asChild>
            <Link href="/brand/discover">
              <Sparkles /> Find creators
            </Link>
          </Button>
        }
      />

      <LinkTabs
        className="mb-6"
        active={tab.value}
        tabs={TABS.map((t) => ({ value: t.value, label: t.label, count: inTab(t).length, href: t.value === "all" ? "/brand/deals" : `/brand/deals?tab=${t.value}` }))}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title={deals.length === 0 ? "No deals yet" : `Nothing in ${tab.label.toLowerCase()}`}
          description={
            deals.length === 0
              ? "Send an offer to a creator from Discover or from a brief's applicants. Every deal is escrow-protected."
              : "Deals move between these tabs automatically as they progress."
          }
          action={
            deals.length === 0 && (
              <Button asChild>
                <Link href="/brand/discover">Discover creators</Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
          {/* Desktop table */}
          <table className="hidden w-full text-sm md:table">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 font-medium">Creator & deal</th>
                <th className="px-3 py-2.5 text-right font-medium">Value</th>
                <th className="px-3 py-2.5 font-medium">Payment</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Next step</th>
                <th className="px-5 py-2.5 text-right font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((d) => (
                <tr key={d.id} className="group relative transition-colors hover:bg-muted/40">
                  <td className="px-5 py-3">
                    <Link href={`/brand/deals/${d.id}`} className="flex items-center gap-3 after:absolute after:inset-0">
                      <Avatar name={d.creator.user.name} src={d.creator.avatarUrl ?? d.creator.user.image} size={34} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{d.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {d.creator.user.name} · @{d.creator.handle}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-right font-medium tabular-nums">{inr(d.amount)}</td>
                  <td className="px-3 py-3 text-muted-foreground">{PAYMENT_MODE_LABEL[d.paymentMode] ?? d.paymentMode}</td>
                  <td className="px-3 py-3">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="px-3 py-3">
                    <StepText step={d.step} />
                  </td>
                  <td className="px-5 py-3 text-right text-xs whitespace-nowrap text-muted-foreground">{timeAgo(d.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile list */}
          <ul className="divide-y md:hidden">
            {rows.map((d) => (
              <li key={d.id}>
                <Link href={`/brand/deals/${d.id}`} className="flex gap-3 px-4 py-3.5 active:bg-muted/50">
                  <Avatar name={d.creator.user.name} src={d.creator.avatarUrl ?? d.creator.user.image} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-medium">{d.title}</p>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{inr(d.amount)}</span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {d.creator.user.name} · {PAYMENT_MODE_LABEL[d.paymentMode] ?? d.paymentMode} · {timeAgo(d.updatedAt)}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge status={d.status} />
                      <StepText step={d.step} />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function StepText({ step }: { step: { text: string; yourMove: boolean } }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", step.yourMove ? "font-medium text-primary" : "text-muted-foreground")}>
      {step.yourMove && <span className="size-1.5 rounded-full bg-primary" />}
      {step.text}
      {step.yourMove && <ArrowRight className="size-3" />}
    </span>
  )
}
