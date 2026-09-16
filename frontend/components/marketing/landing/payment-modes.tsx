import { CheckCircle2, Layers, Rocket } from "lucide-react"
import { Section, SectionHeading } from "@/components/marketing/section"
import { Reveal } from "@/components/marketing/reveal"
import { cn } from "@/lib/utils"

const MODES = [
  {
    icon: CheckCircle2,
    name: "Full on completion",
    tag: "Default for new pairings",
    body: "Brand funds escrow up front; the full amount releases when the final deliverable is approved.",
    bars: [100],
  },
  {
    icon: Rocket,
    name: "Upfront for trusted creators",
    tag: "Reliability score 85+",
    body: "Proven creators can be paid as soon as the contract is signed and escrow is funded.",
    bars: [100],
    upfront: true,
  },
  {
    icon: Layers,
    name: "Custom milestones",
    tag: "Most flexible",
    body: "Split the deal — e.g. 30% on script approval, 70% when content goes live. Each part releases on approval.",
    bars: [30, 70],
    featured: true,
  },
]

export function PaymentModes() {
  return (
    <Section>
      <SectionHeading
        eyebrow="Payment modes"
        title="Pay the way the deal actually works."
        description="Pick a structure when you send the offer. Escrow and approvals work the same in every mode."
      />
      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {MODES.map((m, i) => (
          <Reveal key={m.name} delay={i * 0.07} className="h-full">
            <div
              className={cn(
                "relative flex h-full flex-col rounded-3xl border bg-card p-7",
                m.featured && "border-primary/40 shadow-lg shadow-primary/10 ring-1 ring-primary/20",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="grid size-11 place-items-center rounded-xl bg-accent text-accent-foreground">
                  <m.icon className="size-5" />
                </span>
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", m.featured ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                  {m.tag}
                </span>
              </div>
              <h3 className="mt-6 font-display text-xl font-bold">{m.name}</h3>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{m.body}</p>
              <div className="mt-6">
                <div className="flex h-2.5 gap-1 overflow-hidden rounded-full">
                  {m.bars.map((b, j) => (
                    <div key={j} className={cn("h-full rounded-full", j === 0 && m.bars.length > 1 ? "bg-primary/50" : m.upfront ? "bg-success" : "bg-primary")} style={{ width: `${b}%` }} />
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                  <span>{m.upfront ? "Signed + funded" : m.bars.length > 1 ? "Script · 30%" : "Escrow funded"}</span>
                  <span>{m.upfront ? "Paid immediately" : m.bars.length > 1 ? "Live · 70%" : "Released on approval"}</span>
                </div>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}
