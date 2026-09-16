"use client"
// Milestone actions come from `milestone.allowedActions`
// (SUBMIT | APPROVE | REQUEST_REVISION | RETRY_RELEASE) — never inferred here.
import { useRef, useState } from "react"
import { CalendarClock, Check, ExternalLink, FileUp, Loader2, Paperclip, RotateCw } from "lucide-react"
import type { DealDetail, MediaAssetWithDownload, MilestoneDTO, SubmitMilestoneRequest } from "@hustl/contracts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { browserFetch } from "@/lib/api/browser"
import { approveMilestoneAction, requestRevisionAction, submitMilestoneAction } from "@/app/actions/deals"
import { inr, shortDate, timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"
import { MilestoneStatusBadge } from "./status"
import { uploadDeliverable, validateDeliverable } from "./media-upload"
import { useApiAction } from "./use-deal-action"

type ReleaseMeta = { payoutId?: string; status?: string; net?: number; alreadyReleased?: boolean }

export function MilestoneList({ deal }: { deal: DealDetail }) {
  const creatorFee = deal.feeRates.creator ?? 0
  const milestones = [...deal.milestones].sort((a, b) => a.position - b.position)
  return (
    <ol className="space-y-3">
      {milestones.map((m, i) => (
        <MilestoneRow key={m.id} deal={deal} milestone={m} index={i} creatorFee={creatorFee} />
      ))}
    </ol>
  )
}

function MilestoneRow({ deal, milestone: m, index, creatorFee }: { deal: DealDetail; milestone: MilestoneDTO; index: number; creatorFee: number }) {
  const settled = ["APPROVED", "RELEASED", "REFUNDED"].includes(m.status)
  const net = Math.round(m.amount - m.amount * creatorFee)
  const can = (a: MilestoneDTO["allowedActions"][number]) => m.allowedActions.includes(a)
  const latest = m.submissions[0]

  return (
    <li className={cn("rounded-lg border p-4", m.status === "SUBMITTED" && deal.yourParty === "BRAND" && "border-warning/40 bg-warning-soft/40")}>
      <div className="flex items-start gap-3">
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold", settled ? "bg-success text-white" : "bg-muted text-muted-foreground")}>
          {m.status === "RELEASED" ? <Check className="size-4" /> : index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium">{m.title}</span>
            <MilestoneStatusBadge status={m.status} />
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {m.percent}% · {inr(m.amount)}
              {deal.yourParty === "CREATOR" && creatorFee > 0 && ` (you get ${inr(net)})`}
            </span>
            {m.dueDate && (
              <span className="flex items-center gap-1">
                <CalendarClock className="size-3.5" /> Due {shortDate(m.dueDate)}
                {m.onTime === false && <span className="text-destructive"> · late</span>}
              </span>
            )}
            {m.releasedAt && <span>Paid {timeAgo(m.releasedAt)}</span>}
            {m.revisionCount > 0 && <span>{m.revisionCount} revision{m.revisionCount === 1 ? "" : "s"}</span>}
          </div>

          {latest && <SubmissionCard submission={latest} submittedAt={m.submittedAt} count={m.submissions.length} />}

          {m.status === "REVISION_REQUESTED" && m.revisionNote && (
            <p className="mt-3 rounded-md bg-danger-soft p-3 text-sm">
              <span className="font-medium">Revision note:</span> {m.revisionNote}
            </p>
          )}
          {m.status === "APPROVED" && can("RETRY_RELEASE") && (
            <p className="mt-3 rounded-md bg-warning-soft p-3 text-xs text-warning">
              Approved, but the payout hasn't gone out yet. Retry the release — the creator is paid as soon as it succeeds.
            </p>
          )}
        </div>
      </div>

      {m.allowedActions.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-end gap-2 border-t pt-3">
          {can("SUBMIT") && <SubmitDialog deal={deal} milestone={m} net={net} />}
          {can("REQUEST_REVISION") && <RevisionDialog dealId={deal.id} milestone={m} />}
          {can("APPROVE") && <ApproveDialog dealId={deal.id} milestone={m} />}
          {can("RETRY_RELEASE") && <RetryRelease dealId={deal.id} milestone={m} />}
        </div>
      )}
    </li>
  )
}

function SubmissionCard({ submission, submittedAt, count }: { submission: { url: string | null; mediaAssetId: string | null; note: string | null }; submittedAt: string | null; count: number }) {
  return (
    <div className="mt-3 rounded-md bg-muted/60 p-3 text-sm">
      {submission.url && (
        <a href={submission.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
          View deliverable <ExternalLink className="size-3.5" />
        </a>
      )}
      {submission.mediaAssetId && <AttachmentLink assetId={submission.mediaAssetId} />}
      {submission.note && <p className="mt-1 text-muted-foreground">{submission.note}</p>}
      {submittedAt && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Submitted {timeAgo(submittedAt)}
          {count > 1 && ` · ${count} submissions`}
        </p>
      )}
    </div>
  )
}

/** Media assets are fetched on demand: GET /media/:id returns a short-lived signed URL. */
function AttachmentLink({ assetId }: { assetId: string }) {
  const [busy, setBusy] = useState(false)
  const openFile = async () => {
    setBusy(true)
    try {
      const res = await browserFetch<MediaAssetWithDownload>(`/media/${encodeURIComponent(assetId)}`)
      window.open(res.download.url, "_blank", "noopener,noreferrer")
    } finally {
      setBusy(false)
    }
  }
  return (
    <button type="button" onClick={openFile} disabled={busy} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />} Open uploaded file
    </button>
  )
}

function SubmitDialog({ deal, milestone: m, net }: { deal: DealDetail; milestone: MilestoneDTO; net: number }) {
  const { pending, run } = useApiAction()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<"link" | "file">("link")
  const [url, setUrl] = useState("")
  const [note, setNote] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const linkValid = /^https?:\/\/\S+\.\S+/.test(url.trim())
  const ready = note.trim().length > 0 && (tab === "link" ? linkValid : !!file) && !uploading

  const submit = async () => {
    let body: SubmitMilestoneRequest
    if (tab === "file" && file) {
      setUploading(true)
      setUploadError(null)
      try {
        const asset = await uploadDeliverable(file, deal.id)
        body = { mediaAssetId: asset.id, note: note.trim() }
      } catch (err) {
        setUploading(false)
        setUploadError(err instanceof Error ? err.message : "The upload failed. Please try again.")
        return
      }
      setUploading(false)
    } else {
      body = { url: url.trim(), note: note.trim() }
    }
    await run(() => submitMilestoneAction(deal.id, m.id, body), { success: "Submitted for review", onSuccess: () => setOpen(false) })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">{m.status === "REVISION_REQUESTED" ? "Resubmit" : "Submit deliverable"}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit “{m.title}”</DialogTitle>
          <DialogDescription>Share the live post or upload the file. The brand is notified to review and release {inr(net)} to you.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
          {(["link", "file"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn("flex-1 rounded-md px-3 py-1.5 font-medium", tab === t ? "bg-card shadow-xs" : "text-muted-foreground")}
            >
              {t === "link" ? "Link" : "Upload file"}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {tab === "link" ? (
            <div className="space-y-1.5">
              <Label htmlFor="submission-url">Link</Label>
              <Input id="submission-url" placeholder="https://instagram.com/reel/…" value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="submission-file">File</Label>
              <input
                id="submission-file"
                ref={fileInput}
                type="file"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  setUploadError(f ? validateDeliverable(f) : null)
                  setFile(f)
                }}
              />
              <Button type="button" variant="outline" className="w-full justify-start" onClick={() => fileInput.current?.click()}>
                <FileUp className="size-4" /> {file ? file.name : "Choose an image, video or PDF"}
              </Button>
              {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="submission-note">Note for the brand</Label>
            <Textarea id="submission-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Posted at 7pm IST for peak reach. Stories go live tomorrow." />
          </div>
        </div>

        <DialogFooter>
          <Button disabled={!ready || pending || !!uploadError} onClick={() => void submit()}>
            {(pending || uploading) && <Loader2 className="size-4 animate-spin" />} {uploading ? "Uploading…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ApproveDialog({ dealId, milestone: m }: { dealId: string; milestone: MilestoneDTO }) {
  const { pending, run } = useApiAction()
  const [open, setOpen] = useState(false)
  const [release, setRelease] = useState<ReleaseMeta | null>(null)

  const approve = () =>
    void run(() => approveMilestoneAction(dealId, m.id), {
      onSuccess: (res) => {
        const meta = (res.meta?.release ?? null) as ReleaseMeta | null
        setRelease(meta)
        if (!meta) setOpen(false)
      },
    })

  return (
    <Dialog open={open} onOpenChange={(next) => (setOpen(next), next || setRelease(null))}>
      <DialogTrigger asChild>
        <Button size="sm">Approve &amp; release</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{release ? "Payment released" : `Approve and release ${inr(m.amount)}?`}</DialogTitle>
          <DialogDescription>
            {release
              ? `Payout ${release.status ?? "created"}${release.net !== undefined ? ` · ${inr(release.net)} net to the creator` : ""}${release.alreadyReleased ? " (already released)" : ""}.`
              : `Payment for “${m.title}” goes to the creator immediately. This can't be reversed.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {release ? (
            <Button onClick={() => setOpen(false)}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Not yet
              </Button>
              <Button disabled={pending} onClick={approve}>
                {pending && <Loader2 className="size-4 animate-spin" />} Approve &amp; release
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RevisionDialog({ dealId, milestone: m }: { dealId: string; milestone: MilestoneDTO }) {
  const { pending, run } = useApiAction()
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
          <Button disabled={pending || note.trim().length < 3} onClick={() => void run(() => requestRevisionAction(dealId, m.id, note.trim()), { success: "Revision requested", onSuccess: () => setOpen(false) })}>
            {pending && <Loader2 className="size-4 animate-spin" />} Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Re-approving an APPROVED milestone is the server's retry path for a failed release. */
function RetryRelease({ dealId, milestone: m }: { dealId: string; milestone: MilestoneDTO }) {
  const { pending, run } = useApiAction()
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => void run(() => approveMilestoneAction(dealId, m.id), { success: "Release retried" })}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />} Retry release
    </Button>
  )
}
