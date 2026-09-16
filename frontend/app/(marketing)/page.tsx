import type { Metadata } from "next"
import { Hero } from "@/components/marketing/landing/hero"
import { CategoryMarquee } from "@/components/marketing/landing/marquee"
import { Problem } from "@/components/marketing/landing/problem"
import { EscrowFlow } from "@/components/marketing/landing/escrow-flow"
import { TwoSided } from "@/components/marketing/landing/two-sided"
import { AiSection } from "@/components/marketing/landing/ai-section"
import { PaymentModes } from "@/components/marketing/landing/payment-modes"
import { PricingTeaser } from "@/components/marketing/landing/pricing-teaser"
import { Faq, type FaqItem } from "@/components/marketing/faq"
import { FinalCta } from "@/components/marketing/final-cta"
import { CREATOR_FEE, PLAN_BRAND_FEE, PROCESSING_FEE } from "@/lib/payments/fees"
import { DISPUTE_WINDOW_HOURS } from "@/lib/deals/machine"

export const metadata: Metadata = {
  title: { absolute: "hustl. — Brand deals, secured. Payments, guaranteed." },
}

const pc = (n: number) => `${Math.round(n * 100)}%`

const FAQ: FaqItem[] = [
  {
    q: "What does hustl. cost?",
    a: `Joining is free for both sides. Brands pay a platform fee when they fund a deal — ${pc(PLAN_BRAND_FEE.STARTER)} on Starter or ${pc(PLAN_BRAND_FEE.GROWTH)} on Growth — plus ${pc(PROCESSING_FEE)} payment processing passed through at cost. Creators pay ${pc(CREATOR_FEE)} on each payout they receive.`,
  },
  {
    q: "How do disputes work?",
    a: `After a milestone is submitted, the brand can approve it, request a revision, or raise a dispute within ${DISPUTE_WINDOW_HOURS} hours. While a dispute is open, releases on that deal are frozen. Our team reviews the contract, deliverables and message history, then releases to the creator, refunds the brand, or splits the amount.`,
  },
  {
    q: "When are funds released to the creator?",
    a: "Funds release when the brand approves a milestone. On full-completion deals that’s the final deliverable; on milestone deals each part releases separately. Trusted creators can be offered upfront payment once escrow is funded.",
  },
  {
    q: "Which platforms are supported?",
    a: "Instagram, YouTube, and LinkedIn creators are supported today, along with X and short-form video platforms. Connect accounts to verify followers and engagement and to power match and authenticity scores.",
  },
  {
    q: "Do you support payments in India and internationally?",
    a: "Yes. Deals in India run in INR through Razorpay, including UPI and netbanking. Global deals run through Stripe Connect with payouts to local bank accounts in supported countries.",
  },
  {
    q: "What happens if a creator never delivers?",
    a: "The money never left escrow. If a deal is cancelled or a dispute is resolved in the brand’s favour, the unreleased amount is refunded to the brand.",
  },
]

export default function Home() {
  return (
    <main>
      <Hero />
      <CategoryMarquee />
      <Problem />
      <EscrowFlow />
      <TwoSided />
      <AiSection />
      <PaymentModes />
      <PricingTeaser />
      <Faq items={FAQ} />
      <FinalCta />
    </main>
  )
}
