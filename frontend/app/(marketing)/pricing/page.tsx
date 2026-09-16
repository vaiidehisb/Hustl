import type { Metadata } from "next"
import Link from "next/link"
import { BadgeCheck, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Container, Section, SectionHeading } from "@/components/marketing/section"
import { Reveal } from "@/components/marketing/reveal"
import { FeeCalculator } from "@/components/marketing/fee-calculator"
import { Faq, type FaqItem } from "@/components/marketing/faq"
import { FinalCta } from "@/components/marketing/final-cta"
import { CREATOR_FEE, PLAN_BRAND_FEE, PROCESSING_FEE } from "@/lib/payments/fees"
import { DISPUTE_WINDOW_HOURS } from "@/lib/deals/machine"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Pricing",
  description: "Free to join. Brands pay 5–8% when funding a deal, creators pay 5% per payout, and processing is passed through at cost.",
}

const pc = (n: number) => `${Math.round(n * 100)}%`

const PLANS = [
  {
    name: "Starter",
    price: "Free",
    per: "",
    fee: `${pc(PLAN_BRAND_FEE.STARTER)} brand fee per funded deal`,
    blurb: "For brands running their first creator campaigns.",
    features: ["Unlimited briefs", "AI brief parser & creator matching", "Contracts, escrow & milestone payouts", `${DISPUTE_WINDOW_HOURS}h dispute protection`, "Basic campaign analytics"],
    cta: { label: "Start free", href: "/auth/signup?role=BRAND" },
  },
  {
    name: "Growth",
    price: "₹2,999",
    per: "/mo",
    fee: `${pc(PLAN_BRAND_FEE.GROWTH)} brand fee per funded deal`,
    blurb: "For teams running campaigns every month.",
    features: ["Everything in Starter", "Lower platform fee", "Advanced analytics & creator benchmarks", "Saved creator lists & team seats", "Priority support"],
    cta: { label: "Choose Growth", href: "/auth/signup?role=BRAND" },
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    per: "",
    fee: "Volume-based platform fee",
    blurb: "For agencies and large brands with procurement needs.",
    features: ["Everything in Growth", "Custom contracts & MSAs", "Invoicing & consolidated billing", "Dedicated account manager", "SSO and audit exports"],
    cta: { label: "Talk to sales", href: "mailto:support@hustl.app?subject=Enterprise%20pricing" },
  },
]

const FAQ: FaqItem[] = [
  {
    q: "When is the brand fee charged?",
    a: `Once, when you fund escrow for a deal. The deal value goes into escrow; the platform fee and ${pc(PROCESSING_FEE)} processing are charged on top.`,
  },
  {
    q: "Is the brand fee refunded if a deal is cancelled?",
    a: "If a deal is cancelled before any milestone is released, the escrowed amount is refunded in full. Processing costs already incurred with the payment provider are non-refundable; platform fees on unreleased amounts are refunded.",
  },
  {
    q: "How does the creator fee work with milestones?",
    a: `We deduct ${pc(CREATOR_FEE)} from each payout as it’s released. Two milestones of ₹20,000 and ₹30,000 cost the same in fees as a single ₹50,000 payout.`,
  },
  {
    q: "What is the Verified Creator badge?",
    a: "An optional annual subscription (₹999–₹1,999/yr depending on audience size) that includes identity verification, a verified badge on your profile and higher placement in brand search. It never affects your fee rate.",
  },
  {
    q: "Do you charge GST?",
    a: "Fees are shown exclusive of applicable taxes. GST is added on platform fees for Indian accounts and shown on your invoice.",
  },
  {
    q: "Can I switch plans?",
    a: "Yes — upgrade or downgrade any time. The new fee applies to deals funded after the change.",
  },
]

export default function PricingPage() {
  return (
    <main>
      <section className="relative isolate overflow-hidden pb-12 pt-16 sm:pt-24">
        <div aria-hidden className="absolute inset-0 -z-10 bg-grid opacity-50 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]" />
        <Container>
          <SectionHeading
            eyebrow="Pricing"
            title={
              <span className="text-4xl sm:text-5xl lg:text-6xl">
                Free to join. <span className="text-gradient">Pay when deals close.</span>
              </span>
            }
            description="Simple, transparent fees on funded deals. No listing fees, no retainers, no surprises."
          />
        </Container>
      </section>

      <Section className="pt-4 sm:pt-6">
        <div className="grid gap-5 lg:grid-cols-3">
          {PLANS.map((p, i) => (
            <Reveal key={p.name} delay={i * 0.06} className="h-full">
              <div
                className={cn(
                  "relative flex h-full flex-col rounded-3xl border bg-card p-6 sm:p-7",
                  p.featured && "border-primary/50 shadow-xl shadow-primary/10 ring-1 ring-primary/30",
                )}
              >
                {p.featured && (
                  <span className="absolute -top-3 left-7 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">Most popular</span>
                )}
                <h2 className="font-display text-xl font-bold">{p.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{p.blurb}</p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="font-display text-4xl font-extrabold tabular-nums">{p.price}</span>
                  {p.per && <span className="text-muted-foreground">{p.per}</span>}
                </div>
                <div className="mt-2 text-sm font-medium text-primary">{p.fee}</div>
                <ul className="mt-6 flex-1 space-y-3 border-t pt-6">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2.5 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" /> {f}
                    </li>
                  ))}
                </ul>
                <Button asChild variant={p.featured ? "default" : "outline"} className="mt-8 h-11 rounded-full">
                  <Link href={p.cta.href}>{p.cta.label}</Link>
                </Button>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div className="rounded-3xl border bg-card p-7">
            <div className="text-sm font-semibold text-muted-foreground">For creators</div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-display text-4xl font-extrabold">{pc(CREATOR_FEE)}</span>
              <span className="text-muted-foreground">per payout</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">Free to join, apply and negotiate. We only earn when you get paid.</p>
          </div>
          <div className="rounded-3xl border bg-card p-7">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <BadgeCheck className="size-4 text-primary" /> Verified Creator badge
            </div>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-2">
              <span className="font-display text-3xl font-extrabold sm:text-4xl">₹999–₹1,999</span>
              <span className="text-muted-foreground">/yr</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">Optional. ID verification, a profile badge and priority placement in brand search.</p>
          </div>
        </div>
        <p className="mt-5 text-center text-xs text-muted-foreground">
          Payment processing ({pc(PROCESSING_FEE)}) is passed through to brands at cost via Razorpay or Stripe Connect. Prices exclude GST.
        </p>
      </Section>

      <Section className="bg-muted/30">
        <SectionHeading eyebrow="Fee calculator" title="See exactly what a deal costs." description="Brand and creator views use the same fee engine as the product." />
        <div className="mt-12">
          <FeeCalculator />
        </div>
      </Section>

      <Faq items={FAQ} title="Pricing questions" />
      <FinalCta title="Start with Starter. Upgrade when you scale." />
    </main>
  )
}
