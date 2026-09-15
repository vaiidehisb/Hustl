"use client"

import Link from "next/link"
import { AlertTriangle, CloudOff, Lock, RotateCw, SearchX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { friendlyMessage, isApiError } from "@/lib/api/errors"
import { cn } from "@/lib/utils"

type StateProps = { onRetry?: () => void; compact?: boolean; className?: string }

function StateFrame({
  icon: Icon,
  tone = "muted",
  title,
  body,
  action,
  compact,
  className,
}: {
  icon: typeof AlertTriangle
  tone?: "muted" | "warning" | "danger"
  title: string
  body: string
  action?: React.ReactNode
  compact?: boolean
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center text-center",
        compact ? "gap-2 px-4 py-8" : "gap-3 rounded-2xl border border-dashed bg-card px-6 py-14",
        className,
      )}
    >
      <span
        className={cn(
          "grid place-items-center rounded-2xl",
          compact ? "size-9" : "size-12",
          tone === "warning" ? "bg-warning/15 text-warning" : tone === "danger" ? "bg-danger-soft text-destructive" : "bg-accent text-accent-foreground",
        )}
      >
        <Icon className={compact ? "size-4" : "size-5"} />
      </span>
      <div>
        <p className={cn("font-display font-bold", compact ? "text-sm" : "text-lg")}>{title}</p>
        <p className={cn("mx-auto mt-1 max-w-sm text-muted-foreground", compact ? "text-xs" : "text-sm")}>{body}</p>
      </div>
      {action}
    </div>
  )
}

const RetryButton = ({ onRetry, compact }: { onRetry?: () => void; compact?: boolean }) =>
  onRetry ? (
    <Button variant="outline" size={compact ? "sm" : "default"} className="mt-1 rounded-full" onClick={onRetry}>
      <RotateCw /> Try again
    </Button>
  ) : null

/** Shown when the gateway or a service is down (503/504) or an integration isn't configured. */
export function ServiceUnavailable({ onRetry, compact, className, message }: StateProps & { message?: string }) {
  return (
    <StateFrame
      icon={CloudOff}
      tone="warning"
      title="Service unavailable"
      body={message ?? "We couldn't reach hustl. services just now. Your data is safe, try again in a moment."}
      action={<RetryButton onRetry={onRetry} compact={compact} />}
      compact={compact}
      className={className}
    />
  )
}

/** Maps any thrown error (ApiError or not) to a friendly state with retry. */
export function ApiErrorState({ error, onRetry, compact, className, title }: StateProps & { error: unknown; title?: string }) {
  if (isApiError(error)) {
    if (error.code === "INTEGRATION_UNAVAILABLE") return <ServiceUnavailable onRetry={onRetry} compact={compact} className={className} message={friendlyMessage(error)} />
    if (error.isUnavailable) return <ServiceUnavailable onRetry={onRetry} compact={compact} className={className} />
    if (error.status === 401)
      return (
        <StateFrame
          icon={Lock}
          title="Please log in again"
          body="Your session has expired."
          action={
            <Button asChild size={compact ? "sm" : "default"} className="mt-1 rounded-full">
              <Link href="/auth/signin?expired=1">Log in</Link>
            </Button>
          }
          compact={compact}
          className={className}
        />
      )
    if (error.status === 403) return <StateFrame icon={Lock} title="No access" body={friendlyMessage(error)} compact={compact} className={className} />
    if (error.status === 404) return <StateFrame icon={SearchX} title="Not found" body="This item doesn't exist or was removed." compact={compact} className={className} />
  }
  return (
    <StateFrame
      icon={AlertTriangle}
      tone="danger"
      title={title ?? "Something went wrong"}
      body={friendlyMessage(error)}
      action={<RetryButton onRetry={onRetry} compact={compact} />}
      compact={compact}
      className={className}
    />
  )
}
