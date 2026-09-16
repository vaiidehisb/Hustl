"use client"
// Bridges a server-side ApiError into the shared client error states
// (SERVICE_UNAVAILABLE retry, INTEGRATION_UNAVAILABLE explanation).
import { useRouter } from "next/navigation"
import type { ApiErrorCode } from "@hustl/contracts"
import { ApiErrorState } from "@/components/app/states"
import { ApiError } from "@/lib/api/errors"

export type SerializedApiError = { status: number; code: ApiErrorCode | "UNKNOWN"; message: string }

export function DealErrorState({ error, title, compact }: { error: SerializedApiError; title?: string; compact?: boolean }) {
  const router = useRouter()
  const apiError = new ApiError(error.status, (error.code === "UNKNOWN" ? "INTERNAL_ERROR" : error.code) as ApiErrorCode, error.message)
  return <ApiErrorState error={apiError} title={title} compact={compact} onRetry={() => router.refresh()} />
}
