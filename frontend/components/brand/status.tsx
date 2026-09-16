// Status pill that knows the current API statuses (NEGOTIATING, AGREED, …).
// Server-safe.

import { Pill } from "@/components/app/ui"
import { statusLabel, statusTone } from "./helpers"

export function BrandStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Pill tone={statusTone(status)} className={className}>
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {statusLabel(status)}
    </Pill>
  )
}
