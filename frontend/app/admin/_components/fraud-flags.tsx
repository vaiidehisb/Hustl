"use client"
// GET /admin/fraud-flags?status=OPEN + POST /admin/fraud-flags/:id/review.
// Review records a decision only — no bans, no deletions.
import { useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react"
import type { FraudFlagDto, FraudFlagStatus, FraudSeverity, PageMeta } from "@hustl/contracts"
import { Panel, Pill } from "@/components/app/ui"
import type { Tone } from "@/lib/deals/machine"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { browserFetchWithMeta } from "@/lib/api/browser"
import { reviewFraudFlagAction } from "@/app/actions/admin"
import { useApiAction } from "@/components/deals/use-deal-action"
import { timeAgo } from "@/lib/format"
import { AdminSection } from "./section"

const SEVERITY_TONE: Record<FraudSeverity, Tone> = { LOW: "neutral", MEDIUM: "warning", HIGH: "danger" }
const STATUSES: FraudFlagStatus[] = ["OPEN", "CONFIRMED", "CLEARED"]

export function FraudFlagsTab() {
  const [status, setStatus] = useState<FraudFlagStatus>("OPEN")
  const query = useQuery({
    queryKey: ["admin", "fraud-flags", status],
    queryFn: ({ signal }) => browserFetchWithMeta<FraudFlagDto[], PageMeta>("/admin/fraud-flags", { query: { status, pageSize: 50 }, signal }),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Button key={s} size="sm" variant={s === status ? "default" : "outline"} onClick={() => setStatus(s)}>
            {s.toLowerCase()}
          </Button>
        ))}
      </div>

      <AdminSection
        query={query}
        isEmpty={(d) => d.data.length === 0}
        emptyIcon={ShieldCheck}
        emptyTitle={status === "OPEN" ? "Review queue is clear" : `No ${status.toLowerCase()} flags`}
        emptyDescription="Flags are raised automatically by the fraud model from social metrics and deal behaviour."
      >
        {(d) => (
          <div className="space-y-4">
            {d.data.map((flag) => (
              <FlagCard key={flag.id} flag={flag} />
            ))}
          </div>
        )}
      </AdminSection>
    </div>
  )
}

function FlagCard({ flag }: { flag: FraudFlagDto }) {
  const details = Object.entries(flag.details ?? {})
  return (
    <Panel
      title={flag.label || flag.code}
      description={`${flag.subject === "CREATOR" ? "Creator" : "Deal"} flag · ${flag.source} · raised ${timeAgo(flag.createdAt)}`}
      action={
        <div className="flex items-center gap-2">
          <Pill tone={SEVERITY_TONE[flag.severity] ?? "neutral"}>
            <ShieldAlert className="size-3.5" /> {flag.severity.toLowerCase()}
          </Pill>
          <Pill tone={flag.status === "OPEN" ? "warning" : flag.status === "CONFIRMED" ? "danger" : "success"}>{flag.status.toLowerCase()}</Pill>
        </div>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3 text-sm">
          <dl className="grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Code</dt>
              <dd className="font-mono">{flag.code}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Subject</dt>
              <dd>
                {flag.creatorHandle ? (
                  <Link href={`/creators/${flag.creatorHandle}`} className="text-primary hover:underline">
                    @{flag.creatorHandle}
                  </Link>
                ) : (
                  <span className="font-mono">{flag.dealId ?? flag.creatorId ?? "—"}</span>
                )}
              </dd>
            </div>
          </dl>
          {details.length > 0 && (
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Signals</div>
              <ul className="mt-1 space-y-1 text-xs">
                {details.map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-3 rounded-md bg-muted/60 px-3 py-1.5">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="truncate font-mono">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {flag.status !== "OPEN" && flag.reviewNote && (
            <p className="rounded-lg bg-muted/60 p-3 text-xs">
              <span className="font-medium">Review note:</span> {flag.reviewNote}
              {flag.reviewedAt && <span className="block text-muted-foreground">Reviewed {timeAgo(flag.reviewedAt)}</span>}
            </p>
          )}
        </div>
        {flag.status === "OPEN" && <ReviewForm flagId={flag.id} />}
      </div>
    </Panel>
  )
}

function ReviewForm({ flagId }: { flagId: string }) {
  const qc = useQueryClient()
  const { pending, run } = useApiAction()
  const [note, setNote] = useState("")
  const ready = note.trim().length > 0

  const review = (status: "CLEARED" | "CONFIRMED") =>
    void run(() => reviewFraudFlagAction(flagId, { status, note: note.trim() }), {
      success: status === "CLEARED" ? "Flag cleared" : "Flag confirmed",
      onSuccess: () => {
        setNote("")
        void qc.invalidateQueries({ queryKey: ["admin"] })
      },
    })

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <div className="space-y-1.5">
        <Label htmlFor={`fraud-note-${flagId}`}>Review note (required)</Label>
        <Textarea id={`fraud-note-${flagId}`} rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Checked the follower spike against Phyllo history — organic after a viral reel." />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" disabled={!ready || pending} onClick={() => review("CLEARED")}>
          {pending && <Loader2 className="size-4 animate-spin" />} Clear
        </Button>
        <Button variant="destructive" disabled={!ready || pending} onClick={() => review("CONFIRMED")}>
          Confirm flag
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Confirming records the decision for the trust team. It does not ban or delete the account.</p>
    </div>
  )
}
