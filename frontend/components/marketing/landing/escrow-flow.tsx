import { FileSignature, FileText, Lock, Sparkles, Wallet } from "lucide-react"
import { Section, SectionHeading } from "@/components/marketing/section"
import { Reveal } from "@/components/marketing/reveal"
import { MilestoneTrackerMockup } from "@/components/marketing/mockups"

const STEPS = [
  { icon: FileText, title: "Brief", body: "Brand describes the campaign in plain words. AI structures it." },
  { icon: Sparkles, title: "Match", body: "Ranked creators with match reasons, or creators apply to open briefs." },
  { icon: FileSignature, title: "Contract", body: "Deliverables, dates and payment terms agreed and e-signed." },
  { icon: Lock, title: "Escrow", body: "Brand funds the full deal value before any work starts." },
  { icon: Wallet, title: "Milestone payouts", body: "Each approved milestone releases money to the creator." },
]

export function EscrowFlow() {
  return (
    <Section className="bg-muted/30">
      <SectionHeading
        eyebrow="How escrow protects both sides"
        title="Money moves only when the work does."
        description="Creators know the budget exists before they start. Brands know nothing is paid out until they approve the deliverable."
      />

      <ol className="relative mt-16 grid gap-4 md:grid-cols-5">
        <div aria-hidden className="absolute left-[10%] right-[10%] top-7 hidden h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent md:block" />
        {STEPS.map((s, i) => (
          <Reveal key={s.title} delay={i * 0.06}>
            <li className="relative flex gap-4 md:flex-col md:items-center md:text-center">
              <span className="relative grid size-14 shrink-0 place-items-center rounded-2xl border bg-card text-primary shadow-sm">
                <s.icon className="size-6" />
                <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {i + 1}
                </span>
              </span>
              <div>
                <h3 className="font-display text-base font-bold md:mt-4">{s.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
              </div>
            </li>
          </Reveal>
        ))}
      </ol>

      <Reveal delay={0.1} className="mx-auto mt-14 max-w-xl">
        <MilestoneTrackerMockup active={3} />
      </Reveal>
    </Section>
  )
}
