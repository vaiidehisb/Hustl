// Creator badge panel. The paid badge is promotion; identity verification is
// free and reviewed by a human. The copy has to keep those apart, because a
// creator paying for placement must never read as "hustl. vouched for them".

import { BadgeCheck, Check, ShieldCheck, Sparkles } from "lucide-react"
import type { BillingSubscriptionResponse, PlanProduct } from "@hustl/contracts"
import { Pill } from "@/components/app/ui"
import { cn } from "@/lib/utils"
import { inr, shortDate } from "@/lib/format"
import { SubscribeButton } from "./subscribe-button"
import { CancelSubscription } from "./cancel-subscription"

export function BadgePanel({
  products,
  billing,
  identityVerified,
}: {
  products: (PlanProduct & { owned: boolean; ownedSubscriptionId: string | null })[]
  billing: BillingSubscriptionResponse | null
  identityVerified: boolean
}) {
  const badges = products.filter((p) => p.badgeTier)
  const active = billing?.subscriptions.find((s) => s.entitled && (s.product === "CREATOR_BADGE_STANDARD" || s.product === "CREATOR_BADGE_PRIORITY"))
  const entitlement = billing?.entitlements

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
        <p>
          <span className="font-medium text-foreground">This is paid placement, not identity verification.</span> Identity checks are free and reviewed by our
          team — brands see them separately, and buying a badge never changes them.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {badges.map((p) => {
          const owned = entitlement?.badgeTier === p.badgeTier
          return (
            <div key={p.key} className={cn("flex flex-col rounded-lg border p-4", owned && "border-primary ring-1 ring-primary")}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  {p.badgeTier === "PRIORITY" ? <Sparkles className="size-4 text-primary" /> : <BadgeCheck className="size-4 text-primary" />}
                  {p.badgeTier === "PRIORITY" ? "Priority" : "Standard"}
                </span>
                <span className="text-sm">
                  <span className="font-display text-xl font-bold">{p.price === null ? "—" : inr(p.price)}</span> <span className="text-muted-foreground">/year</span>
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{p.tagline}</p>
              <ul className="mt-3 space-y-1 text-xs">
                {p.unlocks.map((x) => (
                  <li key={x} className="flex items-start gap-1.5">
                    <Check className="mt-0.5 size-3 shrink-0 text-success" /> {x}
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                {owned ? <Pill tone="brand">Active</Pill> : p.price !== null && <SubscribeButton product={p.key} price={p.price} interval={p.interval} className="w-full" />}
              </div>
            </div>
          )
        })}
      </div>

      {active && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
          <div>
            <p className="font-medium">
              {active.productName} · {inr(active.priceAmount)}/year
            </p>
            <p className="text-xs text-muted-foreground">
              {active.cancelAtPeriodEnd
                ? `Cancelled — your badge shows until ${shortDate(entitlement?.badgeUntil ?? active.currentPeriodEnd)}.`
                : `Renews ${shortDate(active.currentPeriodEnd)}.`}
            </p>
          </div>
          {!active.cancelAtPeriodEnd && <CancelSubscription subscriptionId={active.id} keeps="the badge and its placement" until={active.currentPeriodEnd} />}
        </div>
      )}

      {!identityVerified && (
        <p className="text-xs text-muted-foreground">
          Not identity-verified yet? Request that below — it's free, and brands weigh it more heavily than any badge.
        </p>
      )}
    </div>
  )
}
