import { Section, SectionHeading } from "@/components/marketing/section"
import { Reveal } from "@/components/marketing/reveal"
import { AuthenticityMockup, BriefParserMockup, MatchScoreMockup } from "@/components/marketing/mockups"

const CARDS = [
  {
    title: "Brief parser",
    body: "Write the campaign like you’d text a friend. We extract niche, platforms, deliverables, budget and timeline — with a confidence score on every field so you know what to double-check.",
    mock: <BriefParserMockup />,
  },
  {
    title: "Match score with reasons",
    body: "Every creator gets a 0–100 fit score and the evidence behind it: audience overlap, engagement against their follower tier, niche authority and past delivery.",
    mock: <MatchScoreMockup />,
  },
  {
    title: "Authenticity & fraud score",
    body: "Growth spikes, engagement anomalies and low-quality comments are flagged before an offer goes out. High-risk deals get a payout hold for review.",
    mock: <AuthenticityMockup />,
  },
]

export function AiSection() {
  return (
    <Section className="relative overflow-hidden bg-muted/30">
      <SectionHeading
        eyebrow="AI that shows its work"
        title="From a messy brief to the right shortlist in minutes."
        description="No black boxes. Every score comes with the signals behind it."
      />
      <div className="mt-14 grid gap-6 lg:grid-cols-3">
        {CARDS.map((c, i) => (
          <Reveal key={c.title} delay={i * 0.08} className="h-full">
            <article className="flex h-full flex-col rounded-3xl border bg-background p-6 sm:p-7">
              <h3 className="font-display text-xl font-bold">{c.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{c.body}</p>
              <div className="mt-6 flex flex-1 items-end">{c.mock}</div>
            </article>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}
