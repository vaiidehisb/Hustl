"use client"

// Error surfaces for the brand portal. Server components hand down a
// serialised ApiError; retry re-runs the server render.

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Bot, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ApiErrorState } from "@/components/app/states"
import type { SerializedApiError } from "./data"

/** Any failed read: 503/504 get the "service unavailable" state with a retry. */
export function ErrorPanel({ error, title, compact, className }: { error: SerializedApiError; title?: string; compact?: boolean; className?: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <div aria-busy={pending} className={pending ? "opacity-60 transition-opacity" : undefined}>
      <ApiErrorState error={error} title={title} compact={compact} className={className} onRetry={() => start(() => router.refresh())} />
    </div>
  )
}

/**
 * AI-backed panels (matching, brief parsing) get explicit copy when the
 * integration itself is unavailable, so it never reads as "your data is gone".
 */
export function AiErrorPanel({ error, what = "AI matching", compact }: { error: SerializedApiError; what?: string; compact?: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  if (error.code === "INTEGRATION_UNAVAILABLE" || error.code === "SERVICE_UNAVAILABLE" || error.code === "TIMEOUT") {
    return (
      <div className={compact ? "flex flex-col items-center gap-2 px-4 py-8 text-center" : "flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card px-6 py-12 text-center"} role="alert">
        <span className="grid size-11 place-items-center rounded-2xl bg-warning/15 text-warning">
          <Bot className="size-5" />
        </span>
        <div>
          <p className="font-display font-bold">{what} unavailable</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {error.message || "The AI service isn't reachable right now. Everything else keeps working — try again in a moment."}
          </p>
        </div>
        <Button variant="outline" size="sm" className="mt-1 rounded-full" disabled={pending} onClick={() => start(() => router.refresh())}>
          <RotateCw /> Try again
        </Button>
      </div>
    )
  }
  return <ErrorPanel error={error} compact={compact} />
}
