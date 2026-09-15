import type { Metadata } from "next"
import { Container, DraftNotice } from "@/components/marketing/section"
import { DISPUTE_WINDOW_HOURS } from "@/lib/deals/machine"

export const metadata: Metadata = { title: "Terms of service (draft)", robots: { index: false } }

const SECTIONS = [
  { h: "1. The service", p: "hustl. is a marketplace that connects brands with content creators and provides tools for briefs, contracts, escrow payments, milestone delivery and dispute handling. hustl. is not a party to the agreement between a brand and a creator." },
  { h: "2. Accounts", p: "You must provide accurate information and keep your credentials secure. Brands must be authorised to act for the company they represent. Creators must own or control the social accounts they connect." },
  { h: "3. Escrow and payments", p: "Brands fund the full deal value into escrow before work begins. Funds are held by our payment partners (Razorpay in India, Stripe Connect internationally) and released to creators when milestones are approved or disputes are resolved." },
  { h: "4. Fees", p: "Brand platform fees, creator payout fees and payment processing are described on the Pricing page and shown before you confirm any payment. Fees exclude applicable taxes." },
  { h: "5. Disputes", p: `Brands may raise a dispute within ${DISPUTE_WINDOW_HOURS} hours of a milestone submission. While a dispute is open, releases on that deal are frozen. hustl.’s resolution — release, refund or split — is final for the purposes of escrow.` },
  { h: "6. Content and conduct", p: "Creators are responsible for disclosure of paid partnerships as required by law (including ASCI guidelines in India). Fraudulent engagement, off-platform payment solicitation and harassment are prohibited and may lead to suspension." },
  { h: "7. Liability", p: "To the extent permitted by law, hustl.’s liability is limited to the fees you paid in the 12 months before a claim." },
  { h: "8. Changes", p: "We may update these terms. Material changes will be notified in-app or by email before they take effect." },
]

export default function TermsPage() {
  return (
    <main className="py-16 sm:py-24">
      <Container className="max-w-3xl">
        <DraftNotice>These terms are a placeholder draft for product preview and are not legally binding. Final terms will be published before launch.</DraftNotice>
        <h1 className="mt-8 font-display text-4xl font-extrabold tracking-tight">Terms of service</h1>
        <p className="mt-2 text-sm text-muted-foreground">Draft · last updated September 2026</p>
        <div className="mt-10 space-y-8">
          {SECTIONS.map((s) => (
            <section key={s.h}>
              <h2 className="font-display text-lg font-bold">{s.h}</h2>
              <p className="mt-2 leading-relaxed text-muted-foreground">{s.p}</p>
            </section>
          ))}
        </div>
        <p className="mt-12 text-sm text-muted-foreground">
          Questions? <a href="mailto:support@hustl.app" className="text-primary hover:underline">support@hustl.app</a>
        </p>
      </Container>
    </main>
  )
}
