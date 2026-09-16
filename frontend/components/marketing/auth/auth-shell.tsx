import Link from "next/link"
import { ArrowLeft, Lock, ShieldCheck, Sparkles, Wallet } from "lucide-react"
import { Wordmark } from "@/components/marketing/wordmark"
import { DealCardMockup } from "@/components/marketing/mockups"

const POINTS = [
  { icon: Lock, text: "Every deal is escrow-funded before work begins" },
  { icon: Wallet, text: "Milestone payouts released on approval" },
  { icon: Sparkles, text: "AI matching with reasons you can check" },
  { icon: ShieldCheck, text: "72-hour dispute window, handled by humans" },
]

/** Split-screen auth frame: form on the left, product value panel on the right. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-4 py-6 sm:px-10 lg:px-16">
        <div className="flex items-center justify-between">
          <Wordmark />
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Home
          </Link>
        </div>
        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md">{children}</div>
        </main>
        <p className="text-center text-xs text-muted-foreground">
          By continuing you agree to our{" "}
          <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
            Privacy Policy
          </Link>
          .
        </p>
      </div>

      <aside className="relative isolate hidden overflow-hidden bg-brand-gradient p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div aria-hidden className="absolute inset-0 -z-10 bg-grid opacity-15 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]" />
        <div>
          <h2 className="max-w-md font-display text-4xl font-extrabold leading-tight tracking-tight">
            Brand deals, secured. Payments, guaranteed.
          </h2>
          <ul className="mt-8 space-y-3">
            {POINTS.map((p) => (
              <li key={p.text} className="flex items-center gap-3 text-sm opacity-95">
                <span className="grid size-7 place-items-center rounded-lg bg-background/15">
                  <p.icon className="size-4" />
                </span>
                {p.text}
              </li>
            ))}
          </ul>
        </div>
        <div className="mx-auto mt-10 w-full max-w-sm text-foreground">
          <DealCardMockup />
        </div>
      </aside>
    </div>
  )
}
