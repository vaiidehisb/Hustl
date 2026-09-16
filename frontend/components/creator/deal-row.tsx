import Link from "next/link"
import { ChevronRight } from "lucide-react"
import type { DealSummary, DealUiAction } from "@hustl/contracts"
import { Avatar, StatusBadge } from "@/components/app/ui"
import { cn } from "@/lib/utils"
import { inr, shortDate } from "@/lib/format"
import { creatorNextStep, paymentModeLabel } from "./lib"

export function DealRow({ deal, actions = [] }: { deal: DealSummary; actions?: DealUiAction[] }) {
  const step = creatorNextStep(deal, actions)
  return (
    <Link
      href={`/creator/deals/${deal.id}`}
      className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
    >
      <Avatar name={deal.brand.companyName} src={deal.brand.logoUrl} size={38} className="hidden sm:grid" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-medium group-hover:text-primary">{deal.title}</span>
          <StatusBadge status={deal.status} />
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {deal.brand.companyName} · {paymentModeLabel(deal.paymentMode)}
          {deal.dueDate && <> · due {shortDate(deal.dueDate)}</>}
        </div>
        <div className={cn("mt-1.5 flex items-center gap-1.5 text-xs", step.yourMove ? "font-medium text-foreground" : "text-muted-foreground")}>
          {step.yourMove && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
          <span className="line-clamp-1">{step.text}</span>
        </div>
      </div>
      <div className="text-right">
        <div className="font-display font-bold tabular-nums">{inr(deal.amount)}</div>
        <div className="text-[11px] text-muted-foreground">{deal.currency}</div>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}
