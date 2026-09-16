import type { Metadata } from "next"
import { Container, DraftNotice } from "@/components/marketing/section"

export const metadata: Metadata = { title: "Privacy policy (draft)", robots: { index: false } }

const SECTIONS = [
  { h: "What we collect", p: "Account details (name, email, role), brand and creator profile information, connected social account metrics (followers, engagement, audience demographics), deal content and messages, and payment metadata from our payment partners. We do not store full card or bank details." },
  { h: "How we use it", p: "To run the marketplace: matching creators to briefs, computing trust, reliability and authenticity scores, processing escrow payments, resolving disputes, preventing fraud and sending service notifications." },
  { h: "AI processing", p: "Briefs and public creator metrics are processed by AI models to structure briefs and rank matches. Scores come with the signals used, and you can ask us to review any automated decision that affects you." },
  { h: "Sharing", p: "Creator profiles are public. Deal details are shared only between the brand and creator on that deal, our payment partners (Razorpay, Stripe) and, during disputes, our review team. We never sell personal data." },
  { h: "Retention", p: "Deal records and the audit log are kept for as long as required for tax and legal purposes. You can delete your account; public profile data is removed and completed deal records are anonymised." },
  { h: "Your rights", p: "You can access, correct, export or delete your data, consistent with India’s Digital Personal Data Protection Act and GDPR where applicable. Email support@hustl.app." },
]

export default function PrivacyPage() {
  return (
    <main className="py-16 sm:py-24">
      <Container className="max-w-3xl">
        <DraftNotice>This privacy policy is a placeholder draft for product preview. The final policy will be published before launch.</DraftNotice>
        <h1 className="mt-8 font-display text-4xl font-extrabold tracking-tight">Privacy policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Draft · last updated September 2026</p>
        <div className="mt-10 space-y-8">
          {SECTIONS.map((s) => (
            <section key={s.h}>
              <h2 className="font-display text-lg font-bold">{s.h}</h2>
              <p className="mt-2 leading-relaxed text-muted-foreground">{s.p}</p>
            </section>
          ))}
        </div>
      </Container>
    </main>
  )
}
