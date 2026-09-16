import { CalendarClock, HandCoins, MessageSquareWarning, SearchX } from "lucide-react"
import { Section, SectionHeading } from "@/components/marketing/section"
import { Reveal } from "@/components/marketing/reveal"

export function Problem() {
  return (
    <Section>
      <SectionHeading
        eyebrow="The problem"
        title="Creator marketing runs on DMs, spreadsheets and trust. It breaks on both sides."
        description="Payments slip, briefs get lost in threads, and nobody has a paper trail when something goes wrong."
      />

      <div className="mt-14 grid gap-4 md:grid-cols-2">
        <Reveal className="h-full">
          <div className="flex h-full flex-col rounded-3xl border bg-card p-8">
            <span className="text-sm font-semibold text-muted-foreground">For creators</span>
            <p className="mt-6 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              Doing the work is no <span className="text-gradient">guarantee of getting paid.</span>
            </p>
            <ul className="mt-8 space-y-4 text-sm text-muted-foreground">
              <li className="flex gap-3">
                <HandCoins className="size-5 shrink-0 text-warning" /> Net-60 “we’ll pay after the campaign” invoices that never clear.
              </li>
              <li className="flex gap-3">
                <MessageSquareWarning className="size-5 shrink-0 text-warning" /> Scope creep with no contract — “just one more revision”.
              </li>
            </ul>
          </div>
        </Reveal>
        <Reveal delay={0.08} className="h-full">
          <div className="flex h-full flex-col rounded-3xl border bg-card p-8">
            <span className="text-sm font-semibold text-muted-foreground">For brands</span>
            <p className="mt-6 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              Finding the right creator <span className="text-gradient">takes weeks of guesswork.</span>
            </p>
            <ul className="mt-8 space-y-4 text-sm text-muted-foreground">
              <li className="flex gap-3">
                <SearchX className="size-5 shrink-0 text-warning" /> Inflated followers and engagement pods that don’t convert.
              </li>
              <li className="flex gap-3">
                <CalendarClock className="size-5 shrink-0 text-warning" /> Advance payments with no guarantee content ever goes live.
              </li>
            </ul>
          </div>
        </Reveal>
      </div>
    </Section>
  )
}
