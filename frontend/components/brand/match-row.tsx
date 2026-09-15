// A ranked creator row used by the dashboard + brief "AI matches" tab.

import Link from "next/link"
import { AlertTriangle, BadgeCheck, Check } from "lucide-react"
import { Avatar, Pill, ScoreRing } from "@/components/app/ui"
import { OfferDialog, type OfferBrief } from "@/components/brand/offer-dialog"
import { compact, inr, pct } from "@/lib/format"
import type { MatchResult } from "@/lib/ai/match"
import { cn } from "@/lib/utils"

export type MatchRowCreator = {
  id: string
  handle: string
  name: string
  avatarUrl: string | null
  headline: string
  followers: number
  engagementRate: number
  reliabilityScore: number
  verified: boolean
  fromRate: number | null
}

export function MatchRow({
  creator,
  match,
  brief,
  brandFeePct,
  kycVerified,
  compactView,
}: {
  creator: MatchRowCreator
  match: MatchResult
  brief: OfferBrief
  brandFeePct: number
  kycVerified: boolean
  compactView?: boolean
}) {
  return (
    <div className={cn("flex flex-col gap-3 py-4 sm:flex-row sm:items-center", compactView && "py-3")}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <ScoreRing score={match.score} size={compactView ? 40 : 46} />
        <Avatar name={creator.name} src={creator.avatarUrl} size={compactView ? 36 : 40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Link href={`/creators/${creator.handle}`} className="truncate font-medium hover:underline">
              {creator.name}
            </Link>
            {creator.verified && <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Verified" />}
            <span className="text-xs text-muted-foreground">
              @{creator.handle} · {compact(creator.followers)} · {pct(creator.engagementRate)} ER
              {creator.fromRate ? ` · from ${inr(creator.fromRate)}` : ""}
            </span>
          </div>
          {!compactView && creator.headline && <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{creator.headline}</p>}
          {(match.reasons.length > 0 || match.disqualifiers.length > 0) && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {match.reasons.slice(0, compactView ? 2 : 3).map((r) => (
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
      <div className="flex shrink-0 gap-2 pl-[52px] sm:pl-0">
        <OfferDialog
          creator={{ id: creator.id, name: creator.name, handle: creator.handle, avatarUrl: creator.avatarUrl, reliabilityScore: creator.reliabilityScore }}
          brief={brief}
          amount={brief.budgetPerCreator || creator.fromRate}
          brandFeePct={brandFeePct}
          kycVerified={kycVerified}
          variant={compactView ? "outline" : "default"}
        />
      </div>
    </div>
  )
}
