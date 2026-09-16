"use client"
// Keeps the server-rendered deal room fresh: refresh on realtime notifications
// that point at this deal, with a visibility-aware poll as the fallback.
import { useCallback, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import type { NotificationNewPayload } from "@hustl/contracts"
import { useSocketEvent } from "@/hooks/use-realtime"

const POLL_MS = 20_000

export function DealLive({ dealId, pollMs = POLL_MS }: { dealId: string; pollMs?: number }) {
  const router = useRouter()
  const last = useRef(0)

  // Coalesce bursts (a funding event fans out several notifications).
  const refresh = useCallback(() => {
    const now = Date.now()
    if (now - last.current < 1500) return
    last.current = now
    router.refresh()
  }, [router])

  useSocketEvent("notification:new", (n: NotificationNewPayload) => {
    if (n.href?.includes(dealId)) refresh()
  })

  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && refresh()
    const timer = setInterval(tick, pollMs)
    document.addEventListener("visibilitychange", tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [pollMs, refresh])

  return null
}
