import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Container } from "@/components/marketing/section"
import { Reveal } from "@/components/marketing/reveal"

export function FinalCta({
  title = "Your next deal should pay on time.",
  description = "Join hustl. free. Post a brief or build your creator profile in under five minutes.",
}: {
  title?: string
  description?: string
}) {
  return (
    <section className="pb-24 pt-8">
      <Container>
        <Reveal>
          <div className="relative isolate overflow-hidden rounded-[2rem] bg-brand-gradient px-6 py-16 text-center text-primary-foreground sm:px-16 sm:py-20">
            <div aria-hidden className="absolute inset-0 -z-10 bg-grid opacity-15 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
            <h2 className="mx-auto max-w-2xl font-display text-3xl font-extrabold tracking-tight text-balance sm:text-5xl">{title}</h2>
            <p className="mx-auto mt-4 max-w-xl text-base opacity-90 sm:text-lg">{description}</p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" variant="secondary" className="h-12 rounded-full px-7 text-base">
                <Link href="/auth/signup?role=BRAND">
                  Hire creators <ArrowRight />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 rounded-full border-current/40 bg-transparent px-7 text-base text-primary-foreground hover:bg-background/15 hover:text-primary-foreground dark:bg-transparent"
              >
                <Link href="/auth/signup?role=CREATOR">Get brand deals</Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  )
}
