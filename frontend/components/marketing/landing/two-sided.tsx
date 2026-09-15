"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, BarChart3, BadgeCheck, FileSignature, Inbox, Lock, Search, ShieldCheck, Sparkles, Wallet } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Section, SectionHeading } from "@/components/marketing/section"
import { DealCardMockup, MatchScoreMockup } from "@/components/marketing/mockups"

const BRAND = [
  { icon: Sparkles, title: "AI creator matching", body: "Ranked shortlists with reasons — audience fit, engagement vs. benchmark, past deal outcomes." },
  { icon: ShieldCheck, title: "Fraud screening built in", body: "Authenticity scores flag bought followers and engagement pods before you commit budget." },
  { icon: FileSignature, title: "Contracts in one click", body: "Deliverables, usage rights and dates captured in a signed agreement, not a DM thread." },
  { icon: BarChart3, title: "Approve before you pay", body: "Money releases only when you approve each milestone. 72 hours to raise a dispute." },
]
const CREATOR = [
  { icon: Lock, title: "Funded before you start", body: "Every deal is escrow-funded up front, so the budget is real before you shoot a frame." },
  { icon: Wallet, title: "Paid per milestone", body: "Get paid as each deliverable is approved — or upfront once you’re a trusted creator." },
  { icon: Inbox, title: "Briefs that fit you", body: "Open briefs matched to your niche and audience. Apply with a pitch and your rate." },
  { icon: BadgeCheck, title: "A profile that sells", body: "Trust, reliability and authenticity scores that grow with every completed deal." },
]

function Grid({ items }: { items: typeof BRAND }) {
  return (
    <ul className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
      {items.map((f) => (
        <li key={f.title} className="flex gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
            <f.icon className="size-5" />
          </span>
          <div>
            <h3 className="font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function TwoSided() {
  const [tab, setTab] = useState("brands")

  // Deep links from the nav (/#brands, /#creators) select the matching tab.
  useEffect(() => {
    const sync = () => {
      const h = window.location.hash.replace("#", "")
      if (h === "brands" || h === "creators") setTab(h)
    }
    sync()
    window.addEventListener("hashchange", sync)
    return () => window.removeEventListener("hashchange", sync)
  }, [])

  return (
    <Section>
      {/* Anchor targets for both audiences */}
      <span id="brands" className="block scroll-mt-24" />
      <span id="creators" className="block scroll-mt-24" />
      <SectionHeading
        eyebrow="Two-sided by design"
        title="One deal. Both sides protected."
        description="The same contract, escrow and milestone rails — tuned to what each side needs."
      />

      <Tabs value={tab} onValueChange={setTab} className="mt-12 items-center gap-10">
        <TabsList className="h-11 rounded-full p-1">
          <TabsTrigger value="brands" className="rounded-full px-5 text-sm">
            <Search /> For brands
          </TabsTrigger>
          <TabsTrigger value="creators" className="rounded-full px-5 text-sm">
            <Sparkles /> For creators
          </TabsTrigger>
        </TabsList>

        <TabsContent value="brands" className="w-full">
          <div className="grid items-center gap-12 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <Grid items={BRAND} />
              <Button asChild size="lg" className="mt-10 rounded-full">
                <Link href="/auth/signup?role=BRAND">
                  Post your first brief <ArrowRight />
                </Link>
              </Button>
            </div>
            <MatchScoreMockup className="mx-auto max-w-sm" />
          </div>
        </TabsContent>
        <TabsContent value="creators" className="w-full">
          <div className="grid items-center gap-12 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <Grid items={CREATOR} />
              <Button asChild size="lg" className="mt-10 rounded-full">
                <Link href="/auth/signup?role=CREATOR">
                  Create your creator profile <ArrowRight />
                </Link>
              </Button>
            </div>
            <DealCardMockup className="mx-auto max-w-sm" />
          </div>
        </TabsContent>
      </Tabs>
    </Section>
  )
}
