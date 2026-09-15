"use client"

import { useState } from "react"
import { CalendarClock, Check, ExternalLink, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { StatusBadge } from "@/components/app/ui"
import { approveMilestoneAction, requestRevisionAction, submitMilestoneAction } from "@/app/actions/deals"
import { inr, shortDate, timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useAction } from "./use-action"

type M = {
  id: string
  order: number
  title: string
  percent: number
  amount: number
  net: number
  status: string
  dueDate: string | null
  submissionUrl: string | null
  submissionNote: string | null
  revisionNote: string | null
  submittedAt: string | null
  releasedAt: string | null
  disputeHoursLeft: number | null
}

const SETTLED = ["APPROVED", "RELEASED", "REFUNDED"]

export function MilestoneList({ milestones, party, dealStatus, paymentMode }: { milestones: M[]; party: string; dealStatus: string; paymentMode: string }) {
  const nextOpen = milestones.find((m) => !SETTLED.includes(m.status))
  return (
    <ol className="space-y-3">
      {milestones.map((m, i) => {
        const settled = SETTLED.includes(m.status)
        const canSubmit =
          party === "CREATOR" && dealStatus === "IN_PROGRESS" && ["PENDING", "REVISION_REQUESTED"].includes(m.status) && (paymentMode === "UPFRONT" || nextOpen?.id === m.id)
        const canReview = party === "BRAND" && dealStatus === "IN_PROGRESS" && m.status === "SUBMITTED"
        return (
          <li key={m.id} className={cn("rounded-lg border p-4", m.status === "SUBMITTED" && party === "BRAND" && "border-warning/40 bg-warning-soft/40")}>
            <div className="flex items-start gap-3">
              <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold", settled ? "bg-success text-white" : "bg-muted text-muted-foreground")}>
                {settled ? <Check className="size-4" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">{m.title}</span>
                  <StatusBadge status={m.status} />
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    {m.percent}% · {inr(m.amount)}
                    {party === "CREATOR" && ` (you get ${inr(m.net)})`}
                  </span>
                  {m.dueDate && (
                    <span className="flex items-center gap-1">
                      <CalendarClock className="size-3.5" /> Due {shortDate(m.dueDate)}
                    </span>
                  )}
                  {m.releasedAt && <span>Paid {timeAgo(m.releasedAt)}</span>}
                </div>
                {m.submissionUrl && (
                  <div className="mt-3 rounded-md bg-muted/60 p-3 text-sm">
                    <a href={m.submissionUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                      View deliverable <ExternalLink className="size-3.5" />
                    </a>
                    {m.submissionNote && <p className="mt-1 text-muted-foreground">{m.submissionNote}</p>}
                    {m.submittedAt && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Submitted {timeAgo(m.submittedAt)}
                        {m.status === "SUBMITTED" && m.disputeHoursLeft !== null && ` · dispute window ${m.disputeHoursLeft}h left`}
                      </p>
                    )}
                  </div>
                )}
                {m.status === "REVISION_REQUESTED" && m.revisionNote && (
                  <p className="mt-3 rounded-md bg-danger-soft p-3 text-sm">
                    <span className="font-medium">Revision note:</span> {m.revisionNote}
                  </p>
                )}
              </div>
            </div>
            {(canSubmit || canReview) && (
              <div className="mt-4 flex flex-wrap justify-end gap-2 border-t pt-3">
                {canSubmit && <SubmitDialog milestone={m} />}
                {canReview && (
                  <>
                    <RevisionDialog milestoneId={m.id} />
                    <ApproveDialog milestone={m} />
                  </>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function SubmitDialog({ milestone }: { milestone: M }) {
  const { pending, exec } = useAction()
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState(milestone.submissionUrl ?? "")
  const [note, setNote] = useState("")
  const valid = /^https?:\/\/\S+\.\S+/.test(url)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">{milestone.status === "REVISION_REQUESTED" ? "Resubmit" : "Submit deliverable"}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit “{milestone.title}”</DialogTitle>
          <DialogDescription>Share a link to the live post, draft or Drive folder. The brand is notified to review and release {inr(milestone.net)} to you.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sub-url">Link</Label>
            <Input id="sub-url" placeholder="https://instagram.com/reel/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sub-note">Note for the brand</Label>
            <Textarea id="sub-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Posted at 7pm IST for peak reach. Stories go live tomorrow." />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!valid || pending} onClick={() => exec(() => submitMilestoneAction(milestone.id, url, note), "Submitted for review", () => setOpen(false))}>
            {pending && <Loader2 className="size-4 animate-spin" />} Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ApproveDialog({ milestone }: { milestone: M }) {
  const { pending, exec } = useAction()
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Approve & release</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve and release {inr(milestone.amount)}?</DialogTitle>
          <DialogDescription>Payment for “{milestone.title}” goes to the creator immediately. This can't be reversed.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Not yet
          </Button>
          <Button disabled={pending} onClick={() => exec(() => approveMilestoneAction(milestone.id), "Approved — payment released", () => setOpen(false))}>
            {pending && <Loader2 className="size-4 animate-spin" />} Approve & release
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RevisionDialog({ milestoneId }: { milestoneId: string }) {
  const { pending, exec } = useAction()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState("")
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Request revision
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request a revision</DialogTitle>
          <DialogDescription>Be specific about what needs to change so the creator can turn it around quickly.</DialogDescription>
        </DialogHeader>
        <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Please show the SPF texture close-up in the first 3 seconds." />
        <DialogFooter>
          <Button disabled={pending || note.trim().length < 10} onClick={() => exec(() => requestRevisionAction(milestoneId, note), "Revision requested", () => setOpen(false))}>
            {pending && <Loader2 className="size-4 animate-spin" />} Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
