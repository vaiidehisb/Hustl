"use client"
// GET /admin/disputes + POST /admin/disputes/:id/resolve
import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Scale, ShieldCheck } from "lucide-react"
import type { DisputeDTO, DisputeResolution, DisputeStatus, PageMeta, ResolveDisputeRequest } from "@hustl/contracts"
import { Panel, Pill } from "@/components/app/ui"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { browserFetchWithMeta } from "@/lib/api/browser"
import { resolveDisputeAction } from "@/app/actions/admin"
import { useApiAction } from "@/components/deals/use-deal-action"
import { shortDate, timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"
import { AdminSection } from "./section"

const STATUSES: DisputeStatus[] = ["OPEN", "UNDER_REVIEW", "RESOLVED"]
const STATUS_TONE = { OPEN: "danger", UNDER_REVIEW: "warning", RESOLVED: "success" } as const

const RESOLUTIONS: { value: DisputeResolution; label: string; help: string }[] = [
  { value: "RELEASE_TO_CREATOR", label: "Release to creator", help: "The escrowed amount is paid out to the creator." },
  { value: "REFUND_TO_BRAND", label: "Refund to brand", help: "The escrowed amount goes back to the brand." },
  { value: "SPLIT", label: "Split", help: "Divide the escrow between both parties by percentage." },
]

export function DisputesTab() {
  const [status, setStatus] = useState<DisputeStatus>("OPEN")
  const query = useQuery({
    queryKey: ["admin", "disputes", status],
    queryFn: ({ signal }) => browserFetchWithMeta<DisputeDTO[], PageMeta>("/admin/disputes", { query: { status, pageSize: 50 }, signal }),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Button key={s} size="sm" variant={s === status ? "default" : "outline"} onClick={() => setStatus(s)}>
            {s.toLowerCase().replace("_", " ")}
          </Button>
        ))}
      </div>

      <AdminSection
        query={query}
        isEmpty={(d) => d.data.length === 0}
        emptyIcon={ShieldCheck}
        emptyTitle={status === "OPEN" ? "No open disputes" : `No ${status.toLowerCase().replace("_", " ")} disputes`}
        emptyDescription="Disputes freeze escrow releases until a decision is recorded here."
      >
        {(d) => (
          <div className="space-y-4">
            {d.data.map((dispute) => (
              <DisputeCard key={dispute.id} dispute={dispute} />
            ))}
          </div>
        )}
      </AdminSection>
    </div>
  )
}

function DisputeCard({ dispute }: { dispute: DisputeDTO }) {
  return (
    <Panel
      title={dispute.dealTitle ?? `Deal ${dispute.dealId.slice(0, 8)}`}
      description={`Raised ${timeAgo(dispute.createdAt)}${dispute.milestoneId ? " · milestone dispute" : " · whole deal"}`}
      action={<Pill tone={STATUS_TONE[dispute.status]}>{dispute.status.toLowerCase().replace("_", " ")}</Pill>}
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4 text-sm">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Reason</div>
            <p className="mt-1 whitespace-pre-wrap">{dispute.reason}</p>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="text-muted-foreground">Deal id</dt>
              <dd className="font-mono">{dispute.dealId}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Evidence files</dt>
              <dd>{dispute.evidenceIds.length}</dd>
            </div>
          </dl>
          {dispute.status === "RESOLVED" && (
            <div className="rounded-lg bg-success-soft p-3 text-xs">
              <span className="font-medium">
                {RESOLUTIONS.find((r) => r.value === dispute.resolution)?.label ?? dispute.resolution}
                {dispute.splitCreatorPercent !== null ? ` · ${dispute.splitCreatorPercent}% to the creator` : ""}
              </span>
              {dispute.adminNote && <p className="mt-1 text-muted-foreground">{dispute.adminNote}</p>}
              {dispute.resolvedAt && <p className="mt-1 text-muted-foreground">Resolved {shortDate(dispute.resolvedAt)}</p>}
            </div>
          )}
        </div>
        {dispute.status !== "RESOLVED" && <ResolveForm disputeId={dispute.id} />}
      </div>
    </Panel>
  )
}

function ResolveForm({ disputeId }: { disputeId: string }) {
  const qc = useQueryClient()
  const { pending, run } = useApiAction()
  const [resolution, setResolution] = useState<DisputeResolution>("RELEASE_TO_CREATOR")
  const [percent, setPercent] = useState(50)
  const [note, setNote] = useState("")
  const ready = note.trim().length > 0 && (resolution !== "SPLIT" || (percent >= 1 && percent <= 99))

  const submit = () => {
    const body = {
      resolution,
      note: note.trim(),
      ...(resolution === "SPLIT" ? { splitCreatorPercent: Math.round(percent) } : {}),
    } as ResolveDisputeRequest
    void run(() => resolveDisputeAction(disputeId, body), {
      success: "Dispute resolved",
      onSuccess: () => {
        setNote("")
        void qc.invalidateQueries({ queryKey: ["admin"] })
      },
    })
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <div className="space-y-2">
        <Label>Resolution</Label>
        <div className="space-y-1.5">
          {RESOLUTIONS.map((r) => (
            <label
              key={r.value}
              className={cn("flex cursor-pointer gap-2 rounded-md border p-2.5 text-sm", resolution === r.value ? "border-primary bg-card" : "hover:bg-card/60")}
            >
              <input type="radio" name={`resolution-${disputeId}`} value={r.value} checked={resolution === r.value} onChange={() => setResolution(r.value)} className="mt-1" />
              <span>
                <span className="font-medium">{r.label}</span>
                <span className="block text-xs text-muted-foreground">{r.help}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {resolution === "SPLIT" && (
        <div className="space-y-1.5">
          <Label htmlFor={`split-${disputeId}`}>Creator share (%)</Label>
          <Input id={`split-${disputeId}`} type="number" min={1} max={99} value={percent} onChange={(e) => setPercent(Number(e.target.value))} />
          <p className="text-xs text-muted-foreground">Brand is refunded the remaining {100 - Math.min(99, Math.max(1, Math.round(percent)))}%.</p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`note-${disputeId}`}>Decision note (required)</Label>
        <Textarea id={`note-${disputeId}`} rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Deliverable matches the agreed brief except…" />
      </div>

      <Button className="w-full" disabled={!ready || pending} onClick={submit}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Scale className="size-4" />} Resolve dispute
      </Button>
    </div>
  )
}
