import Link from "next/link"
import { ArrowRight, Building2, Lock, Sparkles, UserRound } from "lucide-react"
import { Container, Eyebrow } from "@/components/marketing/section"
import { Reveal } from "@/components/marketing/reveal"
import { DealCardMockup, MatchScoreMockup, PayoutToastMockup } from "@/components/marketing/mockups"

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden pb-20 pt-10 sm:pb-28 sm:pt-16">
      <div aria-hidden className="absolute inset-0 -z-10 bg-grid opacity-60 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />
      <div aria-hidden className="absolute left-1/2 top-[-12rem] -z-10 h-[32rem] w-[60rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />

      <Container>
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
          <div>
            <Reveal>
              <Eyebrow>
                <Lock className="size-3.5 text-success" /> Escrow-protected creator deals
              </Eyebrow>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="mt-6 font-display text-[2.6rem] font-extrabold leading-[1.04] tracking-tight text-balance sm:text-6xl lg:text-[4.1rem]">
                Brand deals, secured.
                <br />
                <span className="text-gradient">Payments, guaranteed.</span>
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-6 max-w-xl text-lg text-pretty text-muted-foreground">
                hustl. is the marketplace where brands find the right creators with AI matching — and every deal runs
                through a contract, escrow funding and milestone payouts. No chasing invoices. No ghosted briefs.
              </p>
            </Reveal>

            <Reveal delay={0.15}>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <Link
                  href="/auth/signup?role=BRAND"
                  className="group flex items-center gap-3 rounded-2xl bg-primary px-5 py-4 text-primary-foreground shadow-lg shadow-primary/20 transition hover:-translate-y-0.5 hover:bg-primary/90"
                >
                  <Building2 className="size-5 shrink-0" />
                  <span className="flex-1">
                    <span className="block text-base font-semibold">Hire creators</span>
                    <span className="block text-xs opacity-80">Post a brief in 2 minutes</span>
                  </span>
                  <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/auth/signup?role=CREATOR"
                  className="group flex items-center gap-3 rounded-2xl border bg-card px-5 py-4 shadow-xs transition hover:-translate-y-0.5 hover:border-primary/40"
                >
                  <UserRound className="size-5 shrink-0 text-primary" />
                  <span className="flex-1">
                    <span className="block text-base font-semibold">Get brand deals</span>
                    <span className="block text-xs text-muted-foreground">Paid on every milestone</span>
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5" />
                </Link>
              </div>
            </Reveal>

            <Reveal delay={0.2}>
              <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t pt-6 sm:gap-6">
                {[
                  { k: "Held in escrow", v: "100%" },
                  { k: "Dispute window", v: "72h" },
                  { k: "Creator fee", v: "5%" },
                ].map((s) => (
                  <div key={s.k} className="min-w-0">
                    <dt className="text-[11px] text-muted-foreground sm:text-xs">{s.k}</dt>
                    <dd className="mt-1 font-display text-xl font-bold tabular-nums sm:text-2xl">{s.v}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>

          <Reveal delay={0.15} y={24} className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="relative lg:pl-10">
              <DealCardMockup className="relative z-10" />
              <div className="relative z-20 -mt-10 ml-auto hidden w-[78%] animate-float sm:block lg:-mr-6">
                <MatchScoreMockup />
              </div>
              <PayoutToastMockup className="absolute -left-2 top-[46%] z-30 hidden md:flex lg:-left-4" />
              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground sm:hidden">
                <Sparkles className="size-3.5 text-primary" /> AI-matched · escrow-funded
              </div>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  )
}
