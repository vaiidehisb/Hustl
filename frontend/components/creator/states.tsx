"use client"

// Server components serialise a failure with `toSerializedError()`; this
// rebuilds the ApiError so `states.tsx` can render the right state, and wires
// retry to a router refresh (SERVICE_UNAVAILABLE / TIMEOUT get a Try again).

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { ApiError } from "@/lib/api/errors"
import type { ApiErrorCode } from "@/lib/api/errors"
import { ApiErrorState } from "@/components/app/states"
import type { SerializedError } from "./lib"

export function ErrorState({ error, compact, className, title }: { error: SerializedError; compact?: boolean; className?: string; title?: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const apiError = new ApiError(error.status, error.code as ApiErrorCode, error.message)
  return <ApiErrorState error={apiError} onRetry={() => startTransition(() => router.refresh())} compact={compact} className={className} title={title} />
}
