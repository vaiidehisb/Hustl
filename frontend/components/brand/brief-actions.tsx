"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Archive, Loader2, RotateCcw, Send, Star, Undo2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { setApplicationStatusAction, setBriefStatusAction } from "@/app/actions/brand"

export function BriefStatusActions({ briefId, status }: { briefId: string; status: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const go = (to: "PUBLISHED" | "CLOSED", msg: string) =>
    start(async () => {
      const res = await setBriefStatusAction(briefId, to)
      if (!res.ok) return void toast.error(res.error)
      toast.success(msg)
      router.refresh()
    })

  if (status === "PUBLISHED")
    return (
      <Button variant="outline" onClick={() => go("CLOSED", "Brief closed — no new applications")} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Archive />} Close brief
      </Button>
    )
  return (
    <Button onClick={() => go("PUBLISHED", status === "DRAFT" ? "Brief is live" : "Brief reopened")} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : status === "DRAFT" ? <Send /> : <RotateCcw />}
      {status === "DRAFT" ? "Publish" : "Reopen"}
    </Button>
  )
}

export function ApplicationStatusButtons({ applicationId, status, name }: { applicationId: string; status: string; name: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const set = (to: "APPLIED" | "SHORTLISTED" | "REJECTED", msg: string) =>
    start(async () => {
      const res = await setApplicationStatusAction(applicationId, to)
      if (!res.ok) return void toast.error(res.error)
      toast.success(msg)
      router.refresh()
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
  if (status === "REJECTED")
    return (
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => set("APPLIED", `${name} moved back to applied`)}>
        <Undo2 className="size-3.5" /> Reconsider
      </Button>
    )
  return null
}
