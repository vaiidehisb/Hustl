import Link from "next/link"
import { Lock } from "lucide-react"
import { Wordmark } from "@/components/marketing/wordmark"

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/how-it-works", label: "How it works" },
      { href: "/pricing", label: "Pricing" },
      { href: "/#brands", label: "For brands" },
      { href: "/#creators", label: "For creators" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/auth/signup?role=BRAND", label: "Hire creators" },
      { href: "/auth/signup?role=CREATOR", label: "Join as a creator" },
      { href: "mailto:support@hustl.app", label: "Contact support" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/terms", label: "Terms of service" },
      { href: "/privacy", label: "Privacy policy" },
    ],
  },
]

export function Footer() {
  return (
    <footer className="border-t bg-card/50">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <Wordmark />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Brand deals, secured. Payments, guaranteed. The creator–brand marketplace where every rupee sits in escrow
              until the work is approved.
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3.5 text-success" /> Payments via Razorpay (India) and Stripe Connect (global)
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold">{col.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} hustl. All rights reserved.</span>
          <span>Made for creators and brands in India and beyond.</span>
        </div>
      </div>
    </footer>
  )
}
