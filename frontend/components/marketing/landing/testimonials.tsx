import Image from "next/image"
import { Quote } from "lucide-react"
import { Section, SectionHeading } from "@/components/marketing/section"
import { Reveal } from "@/components/marketing/reveal"

const QUOTES = [
  {
    quote: "I used to spend the week after a campaign chasing payment. Now the money’s in escrow before I even write the script.",
    name: "Priya M.",
    role: "Lifestyle creator · 220K on Instagram",
    img: "/professional-woman-dark-hair.png",
  },
  {
    quote: "The match reasons are what sold us. We could see why a 60K creator would outperform a 600K one for our serum launch.",
    name: "Karan S.",
    role: "Growth lead · D2C skincare brand",
    img: "/professional-asian-man.png",
  },
  {
    quote: "Milestone payouts changed how I price. I take bigger deals because I’m not carrying the risk alone anymore.",
    name: "Rahul D.",
    role: "Tech reviewer · 410K on YouTube",
    img: "/professional-bearded-man.png",
  },
  {
    quote: "Contracts, approvals and payouts in one place meant our legal team finally signed off on creator campaigns.",
    name: "Emma L.",
    role: "Brand manager · Global consumer app",
    img: "/professional-blonde-woman.png",
  },
]

export function Testimonials() {
  return (
    <Section className="bg-muted/30">
      <SectionHeading
        eyebrow="What early users say"
        title="Built with creators and brand teams."
        description="Illustrative testimonials based on early user interviews — names and photos are placeholders."
      />
      <div className="mt-14 grid gap-5 sm:grid-cols-2">
        {QUOTES.map((q, i) => (
          <Reveal key={q.name} delay={i * 0.05} className="h-full">
            <figure className="flex h-full flex-col rounded-3xl border bg-background p-7">
              <Quote className="size-6 text-primary/60" />
              <blockquote className="mt-4 flex-1 text-base leading-relaxed text-pretty">“{q.quote}”</blockquote>
              <figcaption className="mt-6 flex items-center gap-3">
                <Image src={q.img} alt="" width={40} height={40} className="size-10 rounded-full object-cover" />
                <div>
                  <div className="text-sm font-semibold">{q.name}</div>
                  <div className="text-xs text-muted-foreground">{q.role}</div>
                </div>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">Illustrative only — not endorsements from real customers.</p>
    </Section>
  )
}
