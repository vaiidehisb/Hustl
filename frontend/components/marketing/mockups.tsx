// Product-UI mockups rendered in JSX. Server-safe (no hooks). All data here is
// illustrative sample content, not real users.

import { Check, Clock, FileSignature, Lock, ShieldCheck, Sparkles, Wallet, AlertTriangle, BadgeCheck } from "lucide-react"
import { Avatar, Pill, ScoreRing } from "@/components/app/ui"
import { inr } from "@/lib/format"
import { cn } from "@/lib/utils"

function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_40px_-12px_rgb(0_0_0/0.18)]", className)}>
      {children}
    </div>
  )
}

/** Deal card with escrow status and milestone progress. */
export function DealCardMockup({ className }: { className?: string }) {
  const milestones = [
    { title: "Script approved", amount: 18000, state: "released" as const },
    { title: "Reel goes live", amount: 30000, state: "review" as const },
    { title: "30-day usage rights", amount: 12000, state: "locked" as const },
  ]
  return (
    <Frame className={cn("w-full", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-accent font-display text-sm font-bold text-accent-foreground">GL</span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Glow Lab × @ananya.creates</div>
            <div className="text-xs text-muted-foreground">Summer launch · 1 Reel + 3 Stories</div>
          </div>
        </div>
        <Pill tone="brand">
          <span className="size-1.5 rounded-full bg-current opacity-70" />
          In progress
        </Pill>
      </div>

      <div className="mt-5 rounded-xl bg-muted/60 p-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3.5 text-success" /> Held in escrow
          </span>
          <span>Deal value</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="font-display text-2xl font-bold tabular-nums">{inr(42000)}</span>
          <span className="text-sm font-medium tabular-nums text-muted-foreground">{inr(60000)}</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
          <div className="h-full w-[30%] rounded-full bg-success" />
        </div>
        <div className="mt-1.5 text-[11px] text-muted-foreground">{inr(18000)} paid out · 30%</div>
      </div>

      <ul className="mt-4 space-y-2.5">
        {milestones.map((m) => (
          <li key={m.title} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2.5">
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full",
                  m.state === "released" && "bg-success text-primary-foreground",
                  m.state === "review" && "bg-warning-soft text-warning ring-1 ring-warning/30",
                  m.state === "locked" && "bg-muted text-muted-foreground",
                )}
              >
                {m.state === "released" ? <Check className="size-3" /> : m.state === "review" ? <Clock className="size-3" /> : <Lock className="size-2.5" />}
              </span>
              <span className={cn("truncate", m.state === "locked" && "text-muted-foreground")}>{m.title}</span>
            </span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{inr(m.amount)}</span>
          </li>
        ))}
      </ul>
    </Frame>
  )
}

/** Horizontal milestone / state tracker. */
export function MilestoneTrackerMockup({ className, active = 3 }: { className?: string; active?: number }) {
  const steps = [
    { label: "Offer", icon: Sparkles },
    { label: "Contract", icon: FileSignature },
    { label: "Escrow", icon: Wallet },
    { label: "Delivery", icon: Clock },
    { label: "Payout", icon: Check },
  ]
  return (
    <Frame className={cn("p-4", className)}>
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="font-semibold">Deal progress</span>
        <span className="text-muted-foreground">Step {active + 1} of {steps.length}</span>
      </div>
      <ol className="flex items-center">
        {steps.map((s, i) => {
          const done = i < active
          const current = i === active
          return (
            <li key={s.label} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <span
                  className={cn(
                    "grid size-8 place-items-center rounded-full border text-muted-foreground",
                    done && "border-transparent bg-primary text-primary-foreground",
                    current && "border-primary bg-accent text-accent-foreground ring-4 ring-primary/15",
                  )}
                >
                  <s.icon className="size-3.5" />
                </span>
                <span className={cn("text-[10px] sm:text-[11px]", current ? "font-semibold text-foreground" : "text-muted-foreground")}>{s.label}</span>
              </div>
              {i < steps.length - 1 && <span className={cn("mx-1 mb-5 h-px flex-1", done ? "bg-primary" : "bg-border")} />}
            </li>
          )
        })}
      </ol>
    </Frame>
  )
}

/** AI match score card with reasons. */
export function MatchScoreMockup({ className }: { className?: string }) {
  const reasons = [
    { ok: true, text: "Audience 72% women 18–34 in metro India" },
    { ok: true, text: "Engagement 4.8% — 1.4× tier benchmark" },
    { ok: true, text: "3 completed skincare deals, 4.9★" },
    { ok: false, text: "Rate ₹8K above brief budget" },
  ]
  return (
    <Frame className={cn("w-full", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name="Ananya Rao" size={40} />
          <div>
            <div className="flex items-center gap-1 text-sm font-semibold">
              Ananya Rao <BadgeCheck className="size-4 text-primary" />
            </div>
            <div className="text-xs text-muted-foreground">Skincare · Bengaluru · 184K</div>
          </div>
        </div>
        <ScoreRing score={92} size={52} />
      </div>
      <div className="mt-4 flex items-center gap-1.5 text-xs font-medium text-primary">
        <Sparkles className="size-3.5" /> Why this match
      </div>
      <ul className="mt-2 space-y-2">
        {reasons.map((r) => (
          <li key={r.text} className="flex items-start gap-2 text-[13px]">
            {r.ok ? (
              <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
            ) : (
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
            )}
            <span className={r.ok ? "" : "text-muted-foreground"}>{r.text}</span>
          </li>
        ))}
      </ul>
    </Frame>
  )
}

/** Free-text brief → structured fields with confidence. */
export function BriefParserMockup({ className }: { className?: string }) {
  const fields = [
    { k: "Niche", v: "Skincare / beauty", c: 0.97 },
    { k: "Platforms", v: "Instagram Reels, YouTube Shorts", c: 0.94 },
    { k: "Deliverables", v: "1 Reel · 3 Stories", c: 0.91 },
    { k: "Budget / creator", v: "₹40,000 – ₹60,000", c: 0.88 },
    { k: "Audience", v: "Women 18–30, Tier-1 cities", c: 0.79 },
    { k: "Timeline", v: "Live before 15 Oct", c: 0.62 },
  ]
  return (
    <Frame className={cn("w-full", className)}>
      <div className="rounded-lg border border-dashed bg-muted/40 p-3 text-[13px] leading-relaxed text-muted-foreground">
        “Launching our vitamin C serum next month. Want 5 skincare creators, mostly women in big cities, a reel + a few
        stories each on Insta or Shorts. ~50k per creator, need it live mid-October.”
      </div>
      <div className="my-3 flex items-center gap-2 text-xs font-medium text-primary">
        <Sparkles className="size-3.5" /> Parsed into a structured brief
      </div>
      <dl className="divide-y rounded-lg border">
        {fields.map((f) => (
          <div key={f.k} className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2">
            <div className="min-w-0">
              <dt className="text-[11px] text-muted-foreground">{f.k}</dt>
              <dd className="truncate text-[13px] font-medium">{f.v}</dd>
            </div>
            <Pill tone={f.c >= 0.85 ? "success" : f.c >= 0.7 ? "info" : "warning"} className="tabular-nums">
              {Math.round(f.c * 100)}%
            </Pill>
          </div>
        ))}
      </dl>
    </Frame>
  )
}

/** Authenticity / fraud score card. */
export function AuthenticityMockup({ className }: { className?: string }) {
  const checks = [
    { label: "Follower growth (30d)", value: "+4.2%", ok: true },
    { label: "Engagement vs. tier", value: "1.4×", ok: true },
    { label: "Comment quality", value: "Organic", ok: true },
    { label: "Audience geo match", value: "86% IN", ok: true },
  ]
  return (
    <Frame className={cn("w-full", className)}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Authenticity score</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-display text-3xl font-bold tabular-nums">94</span>
            <Pill tone="success">
              <ShieldCheck className="size-3" /> Low risk
            </Pill>
          </div>
        </div>
        <ScoreRing score={94} size={56} />
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-2">
        {checks.map((c) => (
          <li key={c.label} className="rounded-lg bg-muted/60 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">{c.label}</div>
            <div className="text-sm font-semibold tabular-nums">{c.value}</div>
          </li>
        ))}
      </ul>
    </Frame>
  )
}

/** Small toast-style notification used in the hero. */
export function PayoutToastMockup({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-lg", className)}>
      <span className="grid size-9 place-items-center rounded-full bg-success-soft text-success">
        <Wallet className="size-4" />
      </span>
      <div>
        <div className="text-sm font-semibold tabular-nums">{inr(17100)} paid out</div>
        <div className="text-xs text-muted-foreground">Milestone 1 approved · after 5% fee</div>
      </div>
    </div>
  )
}
