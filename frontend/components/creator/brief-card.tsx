import Link from "next/link"
import { AlertTriangle, ArrowUpRight, BadgeCheck, CalendarClock, Sparkles, Users } from "lucide-react"
import type { BriefDTO } from "@hustl/contracts"
import { Avatar, Pill, ScoreRing, StatusBadge } from "@/components/app/ui"
import { inr, timeAgo } from "@/lib/format"
import { deadlineLabel, nicheLabel, platformLabel } from "./lib"

export type BriefFitSummary = { matchScore: number; matchReasons: string[]; disqualifiers: string[] }

export function BriefCard({ brief, fit }: { brief: BriefDTO; fit?: BriefFitSummary | null }) {
  const deadline = deadlineLabel(brief.deadline)
  const applied = brief.myApplication && brief.myApplication.status !== "WITHDRAWN" ? brief.myApplication : null
  return (
    <Link
      href={`/creator/briefs/${brief.id}`}
      className="group flex flex-col rounded-xl border bg-card p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-3">
        <Avatar name={brief.brand?.companyName ?? "Brand"} src={brief.brand?.logoUrl} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-sm font-medium">
            <span className="truncate">{brief.brand?.companyName ?? "Brand on hustl."}</span>
            {brief.brand?.verified && <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Verified brand" />}
          </div>
          <div className="text-xs text-muted-foreground">
            {brief.niche ? nicheLabel(brief.niche) : "Open niche"} · posted {timeAgo(brief.publishedAt ?? brief.createdAt)}
          </div>
        </div>
        {fit ? <ScoreRing score={fit.matchScore} size={46} label="fit" /> : null}
      </div>

      <h3 className="mt-3 line-clamp-2 font-semibold leading-snug group-hover:text-primary">{brief.title}</h3>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <div>
          <span className="font-display text-xl font-bold tabular-nums">{inr(brief.budgetPerCreator)}</span>
          <span className="ml-1 text-xs text-muted-foreground">per creator</span>
        </div>
        {deadline && (
          <span className={`inline-flex items-center gap-1 text-xs ${deadline.tone === "neutral" ? "text-muted-foreground" : "font-medium text-warning"}`}>
            <CalendarClock className="size-3.5" />
            {deadline.text}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {brief.deliverables.slice(0, 3).map((d, i) => (
          <Pill key={`${d.type}-${i}`}>
            {d.quantity} × {d.type}
          </Pill>
        ))}
        {brief.platforms.map((p) => (
          <Pill key={p} tone="info">
            {platformLabel(p)}
          </Pill>
        ))}
      </div>

      {fit && (fit.matchReasons.length > 0 || fit.disqualifiers.length > 0) && (
        <ul className="mt-4 space-y-1.5 text-xs">
          {fit.matchReasons.slice(0, 2).map((r) => (
            <li key={r} className="flex items-start gap-1.5 text-muted-foreground">
              <Sparkles className="mt-px size-3.5 shrink-0 text-success" />
              {r}
            </li>
          ))}
          {fit.disqualifiers.map((d) => (
            <li key={d} className="flex items-start gap-1.5 rounded-md bg-warning-soft px-2 py-1 font-medium text-warning">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              {d}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Users className="size-3.5" />
          {brief.applicationsCount ?? 0} applied · {brief.creatorsNeeded} {brief.creatorsNeeded === 1 ? "spot" : "spots"}
        </span>
        {applied ? (
          <StatusBadge status={applied.status} />
        ) : (
          <span className="inline-flex items-center gap-0.5 font-medium text-primary">
            View brief <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </span>
        )}
      </div>
    </Link>
  )
}
