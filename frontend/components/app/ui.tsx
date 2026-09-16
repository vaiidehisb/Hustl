// Shared portal building blocks. Server-safe (no hooks) so pages can stay
// server components.

import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { label, tone, type Tone } from "@/lib/deals/machine"
import { initials } from "@/lib/format"

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  eyebrow?: React.ReactNode
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{eyebrow}</div>}
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground ring-border",
  info: "bg-accent text-accent-foreground ring-primary/15",
  brand: "bg-primary/10 text-primary ring-primary/20",
  success: "bg-success-soft text-success ring-success/20",
  warning: "bg-warning-soft text-warning ring-warning/25",
  danger: "bg-danger-soft text-destructive ring-destructive/20",
}

export function Pill({ tone: t = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONE_CLASS[t], className)}>
      {children}
    </span>
  )
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Pill tone={tone(status)} className={className}>
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {label(status)}
    </Pill>
  )
}

export function StatCard({
  label: l,
  value,
  hint,
  icon: Icon,
  trend,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: LucideIcon
  trend?: { value: string; positive?: boolean }
}) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-xs">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{l}</span>
        {Icon && (
          <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-foreground">
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-display text-2xl font-bold tracking-tight tabular-nums">{value}</span>
        {trend && <span className={cn("text-xs font-medium", trend.positive === false ? "text-destructive" : "text-success")}>{trend.value}</span>}
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn("rounded-xl border bg-card shadow-xs", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/50 px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
        <Icon className="size-5" />
      </span>
      <h3 className="mt-4 font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/** 0–100 score as a small ring. */
export function ScoreRing({ score, size = 44, label: l }: { score: number; size?: number; label?: string }) {
  const r = size / 2 - 4
  const c = 2 * Math.PI * r
  const color = score >= 80 ? "var(--success)" : score >= 60 ? "var(--primary)" : score >= 40 ? "var(--warning)" : "var(--destructive)"
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={4} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * score) / 100} />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-xs font-bold tabular-nums">{score}</span>
      </div>
      {l && <span className="text-[11px] text-muted-foreground">{l}</span>}
    </div>
  )
}

// Initials fall back to brand-adjacent gradients: lime through olive into ink.
const AVATAR_GRADIENTS = [
  "from-lime-300 to-lime-500 text-lime-950",
  "from-lime-400 to-emerald-500 text-lime-950",
  "from-stone-700 to-stone-900 text-lime-200",
  "from-lime-200 to-yellow-400 text-lime-950",
  "from-emerald-600 to-lime-500 text-lime-950",
  "from-zinc-800 to-lime-700 text-lime-100",
]

export function Avatar({ name, src, size = 40, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const g = AVATAR_GRADIENTS[[...name].reduce((s, ch) => s + ch.charCodeAt(0), 0) % AVATAR_GRADIENTS.length]
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name} width={size} height={size} className={cn("shrink-0 rounded-full object-cover", className)} style={{ width: size, height: size }} />
  ) : (
    <span
      className={cn("grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-semibold", g, className)}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-label={name}
    >
      {initials(name)}
    </span>
  )
}

export function TextLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("font-medium text-primary underline-offset-4 hover:underline", className)}>
      {children}
    </Link>
  )
}
