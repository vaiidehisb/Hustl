// A ranked creator row (AI match) used by the dashboard + brief "AI matches" tab.
// Scores, reasons and disqualifiers come from GET /briefs/:id/matches.

import Link from "next/link"
import { AlertTriangle, BadgeCheck, Check } from "lucide-react"
import type { BriefMatchDTO } from "@hustl/contracts"
import { Avatar, Pill, ScoreRing } from "@/components/app/ui"
import { OfferDialog, type OfferBrief } from "@/components/brand/offer-dialog"
import { compact, inr, pct } from "@/lib/format"
import { cn } from "@/lib/utils"

export function MatchRow({
  match,
  brief,
  brandPlan,
  kycVerified,
  compactView,
}: {
  match: BriefMatchDTO
  brief: OfferBrief
  brandPlan: string
  kycVerified: boolean
  compactView?: boolean
}) {
  const c = match.creator
  return (
    <div className={cn("flex flex-col gap-3 py-4 sm:flex-row sm:items-center", compactView && "py-3")}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <ScoreRing score={Math.round(match.matchScore)} size={compactView ? 40 : 46} />
        <Avatar name={c.name} src={c.avatarUrl} size={compactView ? 36 : 40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Link href={`/creators/${c.handle}`} className="truncate font-medium hover:underline">
              {c.name}
            </Link>
            {c.verified && <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Verified" />}
            <span className="text-xs text-muted-foreground">
              @{c.handle} · {compact(c.followersTotal)}
              {c.engagementRate !== null ? ` · ${pct(c.engagementRate)} ER` : ""}
            </span>
          </div>
          {!compactView && c.headline && <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{c.headline}</p>}
          {(match.matchReasons.length > 0 || match.disqualifiers.length > 0) && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {match.matchReasons.slice(0, compactView ? 2 : 3).map((r) => (
                <Pill key={r} tone="success" className="font-normal">
                  <Check className="size-3" />
                  {r}
                </Pill>
              ))}
              {match.disqualifiers.map((d) => (
                <Pill key={d} tone="warning" className="font-normal">
                  <AlertTriangle className="size-3" />
                  {d}
                </Pill>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 pl-[52px] sm:pl-0">
        {brief.budgetPerCreator ? <span className="hidden text-xs text-muted-foreground sm:block">{inr(brief.budgetPerCreator)} budget</span> : null}
        <OfferDialog
          creator={{ id: c.id, name: c.name, handle: c.handle, avatarUrl: c.avatarUrl, reliabilityScore: c.reliabilityScore }}
          brief={brief}
          amount={brief.budgetPerCreator ?? null}
          brandPlan={brandPlan}
          kycVerified={kycVerified}
          variant={compactView ? "outline" : "default"}
        />
      </div>
    </div>
  )
}
