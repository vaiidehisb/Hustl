"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import type { ApiActionFail, ApiActionResult } from "@/app/actions/api-result"

export type { ApiActionFail, ApiActionResult }

type RunOptions<T> = {
  /** Toast shown on success. */
  success?: string
  onSuccess?: (result: Extract<ApiActionResult<T>, { ok: true }>) => void
  /** Return true to say "handled" and suppress the default error toast. */
  onError?: (fail: ApiActionFail) => boolean | void
  /** Re-render the server component tree (default true). */
  refresh?: boolean
}

/** Human copy for the failures the deal room actually hits. */
export function actionErrorMessage(fail: ApiActionFail): string {
  switch (fail.code) {
    case "SERVICE_UNAVAILABLE":
    case "TIMEOUT":
      return "Service unavailable, try again in a moment."
    case "INTEGRATION_UNAVAILABLE":
      return fail.message || "That integration isn't configured yet."
    case "CONFLICT":
      return fail.message || "This changed while you were looking at it — refresh and try again."
    case "FORBIDDEN":
      return fail.message || "You don't have access to this action."
    case "VALIDATION_ERROR":
      return Object.values(fail.fieldErrors ?? {})[0] ?? fail.message ?? "Please check the form."
    default:
      return fail.message || "Something went wrong. Please try again."
  }
}

/** Runs a server action with pending state, toasts and a router refresh. */
export function useApiAction() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  const run = useCallback(
    async <T>(fn: () => Promise<ApiActionResult<T>>, opts: RunOptions<T> = {}): Promise<ApiActionResult<T>> => {
      setPending(true)
      try {
        const res = await fn()
        if (res.ok) {
          if (opts.success) toast.success(opts.success)
          opts.onSuccess?.(res)
          if (opts.refresh !== false) router.refresh()
        } else if (!opts.onError?.(res)) {
          toast.error(actionErrorMessage(res))
        }
        return res
      } finally {
        setPending(false)
      }
    },
    [router],
  )

  return { pending, run }
}
