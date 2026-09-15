"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"
import type { ActionResult } from "@/app/actions/result"

/** Runs a server action with pending state, toast feedback and a data refresh. */
export function useAction() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const exec = (fn: () => Promise<ActionResult<unknown>>, success?: string, after?: () => void) =>
    start(async () => {
      const res = await fn()
      if (res.ok) {
        if (success) toast.success(success)
        after?.()
        router.refresh()
      } else toast.error(res.error)
    })
  return { pending, exec }
}
