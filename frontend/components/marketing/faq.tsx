import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Section, SectionHeading } from "@/components/marketing/section"

export type FaqItem = { q: string; a: React.ReactNode }

export function Faq({
  items,
  id = "faq",
  title = "Frequently asked questions",
  description,
  className,
}: {
  items: FaqItem[]
  id?: string
  title?: string
  description?: string
  className?: string
}) {
  return (
    <Section id={id} className={className}>
      <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
        <SectionHeading align="left" eyebrow="FAQ" title={title} description={description ?? "Can’t find an answer? Email support@hustl.app."} />
        <Accordion type="single" collapsible className="rounded-2xl border bg-card px-5 sm:px-6">
          {items.map((it, i) => (
            <AccordionItem key={it.q} value={`item-${i}`}>
              <AccordionTrigger className="py-5 text-base font-semibold hover:no-underline">{it.q}</AccordionTrigger>
              <AccordionContent className="pb-5 text-sm leading-relaxed text-muted-foreground">{it.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Section>
  )
}
