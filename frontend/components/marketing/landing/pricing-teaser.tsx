import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Section } from "@/components/marketing/section"
import { Reveal } from "@/components/marketing/reveal"
import { CREATOR_FEE, PLAN_BRAND_FEE, PROCESSING_FEE } from "@/lib/payments/fees"

const pc = (n: number) => `${Math.round(n * 100)}%`

export function PricingTeaser() {
  const stats = [
    { v: pc(PLAN_BRAND_FEE.STARTER), k: "Brand fee on Starter", sub: `${pc(PLAN_BRAND_FEE.GROWTH)} on Growth` },
    { v: pc(CREATOR_FEE), k: "Creator fee per payout", sub: "Nothing to join" },
    { v: pc(PROCESSING_FEE), k: "Processing, at cost", sub: "Passed through, no markup" },
  ]
  return (
    <Section>
      <Reveal>
        <div className="grid gap-10 rounded-3xl border bg-card p-6 sm:p-12 lg:grid-cols-[1fr_1.4fr] lg:items-center">
          <div>
            <div className="text-sm font-semibold text-primary">Pricing</div>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">Free to join. We earn when deals close.</h2>
            <p className="mt-3 text-muted-foreground">No listing fees, no retainers. A small fee on funded deals keeps escrow, contracts and dispute handling running.</p>
            <Button asChild variant="outline" className="mt-6 rounded-full">
              <Link href="/pricing">
                See pricing & fee calculator <ArrowRight />
              </Link>
            </Button>
          </div>
          <dl className="grid gap-4 sm:grid-cols-3">
            {stats.map((s) => (
              <div key={s.k} className="rounded-2xl bg-muted/60 p-5">
                <dd className="font-display text-4xl font-extrabold tabular-nums">{s.v}</dd>
                <dt className="mt-2 text-sm font-medium">{s.k}</dt>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.sub}</p>
              </div>
            ))}
          </dl>
        </div>
      </Reveal>
    </Section>
  )
}
