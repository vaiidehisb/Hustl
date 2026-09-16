"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Archive, Loader2, RotateCcw, Send, Star, X } from "lucide-react"
import type { ApplicationStatus, BriefStatus } from "@hustl/contracts"
import { Button } from "@/components/ui/button"
import { closeBriefAction, publishBriefAction, setApplicationStatusAction, type ActionResult } from "@/app/actions/brand"

function report(res: ActionResult<unknown>, success: string) {
  if (res.ok) {
    toast.success(success)
    return true
  }
  const { code, message } = res.error
  toast.error(message, {
    description:
      code === "SERVICE_UNAVAILABLE" || code === "TIMEOUT"
        ? "The service didn't respond — nothing changed. Try again in a moment."
        : code === "CONFLICT"
          ? "Reload the page to see the latest state."
          : undefined,
  })
  return false
}

export function BriefStatusActions({ briefId, status }: { briefId: string; status: BriefStatus }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const go = (to: "PUBLISHED" | "CLOSED") =>
    start(async () => {
      const res = to === "CLOSED" ? await closeBriefAction(briefId) : await publishBriefAction(briefId)
      if (report(res, to === "CLOSED" ? "Brief closed — no new applications" : "Brief is live")) router.refresh()
    })

  if (status === "PUBLISHED")
    return (
      <Button variant="outline" onClick={() => go("CLOSED")} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Archive />} Close brief
      </Button>
    )
  return (
    <Button onClick={() => go("PUBLISHED")} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : status === "DRAFT" ? <Send /> : <RotateCcw />}
      {status === "DRAFT" ? "Publish" : "Reopen"}
    </Button>
  )
}

/** The API only accepts SHORTLISTED and REJECTED transitions (409 otherwise). */
export function ApplicationStatusButtons({ applicationId, status, name }: { applicationId: string; status: ApplicationStatus; name: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const set = (to: "SHORTLISTED" | "REJECTED", msg: string) =>
    start(async () => {
      const res = await setApplicationStatusAction(applicationId, to)
      if (report(res, msg)) router.refresh()
    })

  if (status === "APPLIED")
    return (
      <>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => set("SHORTLISTED", `${name} shortlisted`)}>
          <Star className="size-3.5" /> Shortlist
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => set("REJECTED", `${name} marked not selected`)} aria-label={`Reject ${name}`}>
          <X className="size-3.5" />
        </Button>
      </>
    )
  if (status === "SHORTLISTED")
    return (
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => set("REJECTED", `${name} marked not selected`)}>
        <X className="size-3.5" /> Reject
      </Button>
    )
  return null
}
