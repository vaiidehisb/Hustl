"use client"

import { useState } from "react"
import { Building2, UserRound } from "lucide-react"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CREATOR_FEE, PLAN_BRAND_FEE, PROCESSING_FEE, fundingBreakdown, payoutBreakdown } from "@/lib/payments/fees"
import { inr } from "@/lib/format"
import { cn } from "@/lib/utils"

const MIN = 1_000
const MAX = 10_00_000
const pc = (n: number) => `${+(n * 100).toFixed(1)}%`

function AmountField({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <Label htmlFor={`amt-${label}`} className="text-sm text-muted-foreground">
          {label}
        </Label>
        <div className="relative w-40">
          <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-muted-foreground">₹</span>
          <Input
            id={`amt-${label}`}
            inputMode="numeric"
            value={value.toLocaleString("en-IN")}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[^0-9]/g, ""))
              onChange(Math.min(MAX, Number.isFinite(n) ? n : 0))
            }}
            className="h-10 pl-7 text-right font-semibold tabular-nums"
          />
        </div>
      </div>
      <Slider className="mt-5" min={MIN} max={MAX} step={1000} value={[Math.max(MIN, value)]} onValueChange={([v]) => onChange(v)} aria-label={label} />
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>{inr(MIN)}</span>
        <span>{inr(MAX)}</span>
      </div>
    </div>
  )
}

function Row({ k, v, strong, muted }: { k: string; v: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between py-2.5 text-sm", strong && "border-t pt-4 text-base font-semibold", muted && "text-muted-foreground")}>
      <span>{k}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  )
}

export function FeeCalculator() {
  const [amount, setAmount] = useState(50_000)
  const [plan, setPlan] = useState<"STARTER" | "GROWTH">("STARTER")

  const funding = fundingBreakdown(amount, PLAN_BRAND_FEE[plan])
  const payout = payoutBreakdown(amount)
  const alt = fundingBreakdown(amount, PLAN_BRAND_FEE.GROWTH)
  const growthSaves = funding.total - alt.total

  return (
    <div className="rounded-3xl border bg-card p-5 shadow-sm sm:p-8">
      <Tabs defaultValue="brand" className="gap-8">
        <TabsList className="h-11 w-full rounded-full p-1 sm:w-fit">
          <TabsTrigger value="brand" className="rounded-full px-5">
            <Building2 /> I’m a brand
          </TabsTrigger>
          <TabsTrigger value="creator" className="rounded-full px-5">
            <UserRound /> I’m a creator
          </TabsTrigger>
        </TabsList>

        <TabsContent value="brand">
          <div className="grid gap-10 lg:grid-cols-2">
            <div className="space-y-8">
              <AmountField label="Deal value (paid to creator)" value={amount} onChange={setAmount} />
              <div>
                <div className="text-sm text-muted-foreground">Plan</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(["STARTER", "GROWTH"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPlan(p)}
                      aria-pressed={plan === p}
                      className={cn(
                        "rounded-xl border px-4 py-3 text-left transition",
                        plan === p ? "border-primary bg-accent ring-1 ring-primary" : "hover:border-primary/40",
                      )}
                    >
                      <div className="text-sm font-semibold">{p === "STARTER" ? "Starter" : "Growth"}</div>
                      <div className="text-xs text-muted-foreground">{pc(PLAN_BRAND_FEE[p])} brand fee</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-muted/50 p-5 sm:p-6">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">You pay at funding</div>
              <div className="mt-1 font-display text-4xl font-extrabold tabular-nums">{inr(funding.total)}</div>
              <div className="mt-5 divide-y">
                <Row k="Escrow (deal value)" v={inr(funding.escrow)} />
                <Row k={`Platform fee · ${pc(PLAN_BRAND_FEE[plan])}`} v={inr(funding.brandFee)} />
                <Row k={`Processing · ${pc(PROCESSING_FEE)} pass-through`} v={inr(funding.processing)} muted />
                <Row k="Total" v={inr(funding.total)} strong />
              </div>
              {plan === "STARTER" && growthSaves > 0 && (
                <p className="mt-4 text-xs text-muted-foreground">
                  On Growth you’d save {inr(growthSaves)} in fees on this deal.
                </p>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="creator">
          <div className="grid gap-10 lg:grid-cols-2">
            <AmountField label="Deal value you agreed" value={amount} onChange={setAmount} />
            <div className="rounded-2xl bg-muted/50 p-5 sm:p-6">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">You receive</div>
              <div className="mt-1 font-display text-4xl font-extrabold tabular-nums text-success">{inr(payout.net)}</div>
              <div className="mt-5 divide-y">
                <Row k="Released from escrow" v={inr(payout.gross)} />
                <Row k={`hustl. fee · ${pc(CREATOR_FEE)} per payout`} v={`− ${inr(payout.fee)}`} />
                <Row k="Net to your bank" v={inr(payout.net)} strong />
              </div>
              <p className="mt-4 text-xs text-muted-foreground">Split into milestones? The 5% applies to each payout, so the total is the same.</p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
