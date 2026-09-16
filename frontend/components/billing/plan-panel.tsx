// Brand plan panel: the catalogue, what the brand is on now, and what a
// switch changes about their fee. Server component — actions live in the
// client buttons it renders.

import { AlertTriangle, Check } from "lucide-react"
import type { BillingSubscriptionResponse, PlanProduct } from "@hustl/contracts"
import { BRAND_FEE_RATES, PROCESSING_FEE_RATE } from "@hustl/contracts"
import { Pill } from "@/components/app/ui"
import { cn } from "@/lib/utils"
import { inr, shortDate } from "@/lib/format"
import { SubscribeButton } from "./subscribe-button"
import { CancelSubscription } from "./cancel-subscription"

const PLAN_ORDER = ["STARTER", "GROWTH", "ENTERPRISE"] as const

export function PlanPanel({
  plan,
  products,
  billing,
}: {
  plan: string
  products: (PlanProduct & { owned: boolean; ownedSubscriptionId: string | null })[]
  billing: BillingSubscriptionResponse | null
}) {
  const growth = products.find((p) => p.key === "BRAND_GROWTH")
  const growthSub = billing?.subscriptions.find((s) => s.product === "BRAND_GROWTH" && s.entitled)
  // The profile's plan is set by an event a moment after payment, so trust the
  // entitlement first — otherwise the page still says "Starter" right after paying.
  const effectivePlan = billing?.entitlements.brandPlan ?? plan
  const feeNow = BRAND_FEE_RATES[effectivePlan as keyof typeof BRAND_FEE_RATES] ?? BRAND_FEE_RATES.STARTER

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {PLAN_ORDER.map((id) => {
          const product = products.find((p) => p.brandPlan === id)
          const rate = BRAND_FEE_RATES[id]
          const current = effectivePlan === id
          return (
            <div key={id} className={cn("flex flex-col rounded-lg border p-4", current && "border-primary ring-1 ring-primary")}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{id === "STARTER" ? "Starter" : product?.name ?? id}</span>
                <span className="text-sm">
                  <span className="font-display text-xl font-bold">{Math.round(rate * 100)}%</span> <span className="text-muted-foreground">fee</span>
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {id === "STARTER" ? "Pay as you go. No monthly commitment." : (product?.tagline ?? "Custom terms, managed onboarding.")}
              </p>
              <ul className="mt-3 space-y-1 text-xs">
                {(product?.unlocks ?? ["Unlimited briefs", "AI matching and brief parser", "Escrow on every deal"]).map((x) => (
                  <li key={x} className="flex items-start gap-1.5">
                    <Check className="mt-0.5 size-3 shrink-0 text-success" /> {x}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between gap-2 text-sm">
                {current ? (
                  <Pill tone="brand">Current plan</Pill>
                ) : product?.selfServe && product.price !== null ? (
                  <SubscribeButton product={product.key} price={product.price} interval={product.interval} label={`Upgrade · ${inr(product.price)}/mo`} className="w-full" />
                ) : (
                  <span className="text-xs text-muted-foreground">Contact sales</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {growthSub && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
          <div>
            <p className="font-medium">
              {growth?.name ?? "Growth"} · {inr(growthSub.priceAmount)}/month
            </p>
            <p className="text-xs text-muted-foreground">
              {growthSub.cancelAtPeriodEnd
                ? `Cancelled — your 5% fee applies until ${shortDate(growthSub.currentPeriodEnd)}.`
                : `Renews ${shortDate(growthSub.currentPeriodEnd)}.`}
              {growthSub.status === "PAST_DUE" && " Last payment failed."}
            </p>
          </div>
          {!growthSub.cancelAtPeriodEnd && <CancelSubscription subscriptionId={growthSub.id} keeps="the 5% platform fee" until={growthSub.currentPeriodEnd} />}
        </div>
      )}

      {billing?.subscriptions.some((s) => s.status === "PAST_DUE") && (
        <p className="flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-xs text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          A subscription payment failed. Update the payment method with your provider — access continues until the end of the paid period.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        You currently pay {Math.round(feeNow * 100)}% platform fee plus {Math.round(PROCESSING_FEE_RATE * 100)}% processing when you fund escrow. Fees are
        snapshotted on each deal, so deals already signed keep the rate they were signed at. Creators never see your plan.
      </p>
    </div>
  )
}
