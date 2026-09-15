import type { Metadata } from "next"
import {
  ArrowRight,
  BadgeCheck,
  FileSignature,
  FileText,
  Gavel,
  Handshake,
  Inbox,
  ListChecks,
  Lock,
  MessagesSquare,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Star,
  Upload,
  UserPlus,
  Wallet,
  XCircle,
} from "lucide-react"
import { Container, Section, SectionHeading } from "@/components/marketing/section"
import { Reveal } from "@/components/marketing/reveal"
import { FinalCta } from "@/components/marketing/final-cta"
import { DEAL_STAGES, DISPUTE_WINDOW_HOURS, MAX_NEGOTIATION_ROUNDS } from "@/lib/deals/machine"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "How it works",
  description: "From brief to payout: AI matching, contracts, escrow funding, milestone delivery and a 72-hour dispute window.",
}

const BRAND_FLOW = [
  { icon: UserPlus, title: "Create a brand account", body: "Add company details. Verification unlocks higher deal limits." },
  { icon: FileText, title: "Describe the campaign", body: "Write the brief in plain language — no template needed." },
  { icon: Sparkles, title: "AI structures the brief", body: "Niche, platforms, deliverables, budget and timeline extracted with confidence scores." },
  { icon: ListChecks, title: "Review & publish", body: "Fix any low-confidence fields, then publish to the marketplace or keep it private." },
  { icon: Search, title: "Get a ranked shortlist", body: "Creators scored for fit, with reasons, authenticity and past delivery." },
  { icon: Send, title: "Send an offer", body: "Set the amount, payment mode and milestones." },
  { icon: MessagesSquare, title: "Negotiate", body: `Up to ${MAX_NEGOTIATION_ROUNDS} counter-offer rounds keep things moving.` },
  { icon: FileSignature, title: "Sign the contract", body: "Both sides e-sign deliverables, dates, usage rights and payment terms." },
  { icon: Lock, title: "Fund escrow", body: "Deal value plus fees are collected. Work starts only when escrow is funded." },
  { icon: Upload, title: "Creator delivers", body: "Drafts and live links are submitted against each milestone." },
  { icon: BadgeCheck, title: "Approve or request changes", body: `Approve, ask for a revision, or raise a dispute within ${DISPUTE_WINDOW_HOURS} hours.` },
  { icon: Wallet, title: "Payout & review", body: "Approved milestones release to the creator. Both sides leave a review." },
]

const CREATOR_FLOW = [
  { icon: Inbox, title: "Browse open briefs", body: "Briefs matched to your niche, audience and rate — with the budget shown up front." },
  { icon: Send, title: "Apply with a pitch", body: "Share your angle and proposed rate. Your match score is attached automatically." },
  { icon: Star, title: "Get shortlisted", body: "Brands compare applicants side by side and shortlist the best fits." },
  { icon: Handshake, title: "Receive an offer", body: "Accept, counter, or decline. From here it’s the same contract → escrow → payout rails." },
]

export default function HowItWorksPage() {
  return (
    <main>
      <section className="relative isolate overflow-hidden pb-8 pt-16 sm:pt-24">
        <div aria-hidden className="absolute inset-0 -z-10 bg-grid opacity-50 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]" />
        <Container>
          <SectionHeading
            eyebrow="How it works"
            title={<span className="text-4xl sm:text-5xl lg:text-6xl">From brief to payout, <span className="text-gradient">on rails.</span></span>}
            description="Every deal on hustl. follows the same state machine, so both sides always know what happens next — and who holds the money."
          />
        </Container>
      </section>

      <Section id="brands">
        <div className="grid gap-12 lg:grid-cols-[1fr_2fr]">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <SectionHeading
              align="left"
              eyebrow="Brand-initiated"
              title="12 steps, most of them automatic."
              description="Brands post a brief, pick from an AI-ranked shortlist and approve work before anything is paid."
            />
          </div>
          <ol className="grid gap-3 sm:grid-cols-2">
            {BRAND_FLOW.map((s, i) => (
              <Reveal key={s.title} delay={(i % 2) * 0.05}>
                <li className="flex h-full gap-4 rounded-2xl border bg-card p-5">
                  <div className="flex flex-col items-center">
                    <span className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground">
                      <s.icon className="size-5" />
                    </span>
                    <span className="mt-2 font-mono text-[11px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                  </div>
                  <div>
                    <h3 className="font-semibold">{s.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </Section>

      <Section id="creators" className="bg-muted/30">
        <SectionHeading
          eyebrow="Creator-initiated"
          title="Or creators come to you."
          description="Open briefs let creators raise their hand. Brands stay in control of who gets an offer."
        />
        <ol className="mt-14 grid gap-4 md:grid-cols-4">
          {CREATOR_FLOW.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.06} className="h-full">
              <li className="relative flex h-full flex-col rounded-2xl border bg-background p-6">
                <span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
                  <s.icon className="size-5" />
                </span>
                <h3 className="mt-5 font-display text-lg font-bold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
                {i < CREATOR_FLOW.length - 1 && (
                  <ArrowRight aria-hidden className="absolute -right-3.5 top-9 z-10 hidden size-5 rounded-full bg-background text-muted-foreground md:block" />
                )}
              </li>
            </Reveal>
          ))}
        </ol>
      </Section>

      <Section>
        <SectionHeading
          eyebrow="Deal state machine"
          title="Every transition is validated server-side."
          description="Deals move forward one state at a time. Anything off the path is rejected — no skipping escrow, no paying out before approval."
        />
        <Reveal className="mt-14">
          <div className="overflow-x-auto rounded-3xl border bg-card p-6 sm:p-10">
            <div className="min-w-[720px]">
              <ol className="flex items-center">
                {DEAL_STAGES.map((s, i) => (
                  <li key={s.status} className="flex flex-1 items-center last:flex-none">
                    <div
                      className={cn(
                        "rounded-xl border px-4 py-3 text-center",
                        s.status === "FUNDED" && "border-primary/50 bg-accent text-accent-foreground",
                        s.status === "COMPLETED" && "border-success/40 bg-success-soft text-success",
                      )}
                    >
                      <div className="text-sm font-semibold whitespace-nowrap">{s.label}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{s.status}</div>
                    </div>
                    {i < DEAL_STAGES.length - 1 && <ArrowRight className="mx-2 size-4 shrink-0 text-muted-foreground" />}
                  </li>
                ))}
              </ol>
              <div className="mt-8 grid grid-cols-2 gap-6">
                <div className="flex items-start gap-3 rounded-xl border border-destructive/25 bg-danger-soft p-4">
                  <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
                  <div>
                    <div className="text-sm font-semibold">Disputed</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Either side can raise from <b>Escrow funded</b> or <b>Delivery</b>. An admin resolves back to Delivery (release, refund or split) or cancels.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-xl border bg-muted/50 p-4">
                  <XCircle className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-semibold">Cancelled</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Declined offers, or either side cancelling before escrow is funded. Unreleased escrow is refunded to the brand.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </Section>

      <Section className="bg-muted/30">
        <div className="grid gap-5 lg:grid-cols-2">
          <Reveal className="h-full">
            <div className="h-full rounded-3xl border bg-background p-8">
              <span className="grid size-11 place-items-center rounded-xl bg-accent text-accent-foreground">
                <MessagesSquare className="size-5" />
              </span>
              <h2 className="mt-6 font-display text-2xl font-bold">Negotiation, capped at {MAX_NEGOTIATION_ROUNDS} rounds</h2>
              <p className="mt-2 text-muted-foreground">
                Offers shouldn’t turn into week-long threads. Each side can counter amount, deliverables or payment mode — up to {MAX_NEGOTIATION_ROUNDS}{" "}
                rounds. After that, the last offer is accepted or declined.
              </p>
              <ol className="mt-6 space-y-2 text-sm">
                <li className="flex items-center justify-between rounded-lg bg-muted/60 px-4 py-2.5">
                  <span>Brand offer</span>
                  <span className="tabular-nums text-muted-foreground">₹40,000 · 2 milestones</span>
                </li>
                <li className="flex items-center justify-between rounded-lg bg-muted/60 px-4 py-2.5">
                  <span>Round 1 · Creator counter</span>
                  <span className="tabular-nums text-muted-foreground">₹55,000</span>
                </li>
                <li className="flex items-center justify-between rounded-lg bg-muted/60 px-4 py-2.5">
                  <span>Round 2 · Brand counter</span>
                  <span className="tabular-nums text-muted-foreground">₹48,000</span>
                </li>
                <li className="flex items-center justify-between rounded-lg border border-success/30 bg-success-soft px-4 py-2.5 font-medium">
                  <span>Accepted → contract</span>
                  <span className="tabular-nums text-success">₹48,000</span>
                </li>
              </ol>
            </div>
          </Reveal>
          <Reveal delay={0.08} className="h-full">
            <div className="h-full rounded-3xl border bg-background p-8">
              <span className="grid size-11 place-items-center rounded-xl bg-danger-soft text-destructive">
                <Gavel className="size-5" />
              </span>
              <h2 className="mt-6 font-display text-2xl font-bold">Dispute policy</h2>
              <p className="mt-2 text-muted-foreground">Fair to both sides, with a clear clock.</p>
              <ul className="mt-6 space-y-4 text-sm">
                {[
                  { k: `${DISPUTE_WINDOW_HOURS}-hour window`, v: `Brands have ${DISPUTE_WINDOW_HOURS} hours after a milestone is submitted to approve, request a revision or open a dispute.` },
                  { k: "Releases frozen", v: "While a dispute is open, no money on that deal is released to anyone until it’s resolved." },
                  { k: "Evidence-based review", v: "Our team reviews the signed contract, submissions and in-app messages." },
                  { k: "Three outcomes", v: "Release to the creator, refund the brand, or split — recorded in the deal’s audit log." },
                ].map((r) => (
                  <li key={r.k} className="flex gap-3">
                    <Lock className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>
                      <span className="font-semibold">{r.k}.</span> <span className="text-muted-foreground">{r.v}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </Section>

      <FinalCta title="Ready to run your first deal on rails?" />
    </main>
  )
}
