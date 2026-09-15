import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { Avatar, StatusBadge } from "@/components/app/ui"
import { cn } from "@/lib/utils"
import { inr, shortDate } from "@/lib/format"
import { creatorNextStep } from "./lib"

export type DealRowData = {
  id: string
  title: string
  amount: number
  status: string
  awaitingParty: string
  creatorSignedAt: Date | null
  dueDate: Date | null
  updatedAt: Date
  brand: { companyName: string; logoUrl: string | null }
  milestones: { title: string; status: string; dueDate: Date | null; order: number; amount: number }[]
}

export function DealRow({ deal }: { deal: DealRowData }) {
  const step = creatorNextStep(deal)
  const total = deal.milestones.length
  const released = deal.milestones.filter((m) => m.status === "RELEASED").length
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
          {deal.brand.companyName}
          {deal.dueDate && <> · due {shortDate(deal.dueDate)}</>}
          {total > 0 && (
            <>
              {" "}
              · {released}/{total} milestones paid
            </>
          )}
        </div>
        <div className={cn("mt-1.5 flex items-center gap-1.5 text-xs", step.yourMove ? "font-medium text-foreground" : "text-muted-foreground")}>
          {step.yourMove && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
          <span className="line-clamp-1">{step.text}</span>
        </div>
      </div>
      <div className="text-right">
        <div className="font-display font-bold tabular-nums">{inr(deal.amount)}</div>
        {total > 0 && (
          <div className="mt-1.5 ml-auto h-1 w-20 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-success" style={{ width: `${(released / total) * 100}%` }} />
          </div>
        )}
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}
