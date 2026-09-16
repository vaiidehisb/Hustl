"use client"
// GET /admin/verifications + POST /admin/verifications/:id/decision
import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { BadgeCheck, Loader2 } from "lucide-react"
import type { AdminVerificationItem, PageMeta, VerificationStatus } from "@hustl/contracts"
import { Panel, Pill } from "@/components/app/ui"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { browserFetchWithMeta } from "@/lib/api/browser"
import { decideVerificationAction } from "@/app/actions/admin"
import { useApiAction } from "@/components/deals/use-deal-action"
import { timeAgo } from "@/lib/format"
import { AdminSection } from "./section"

const STATUSES: VerificationStatus[] = ["PENDING", "APPROVED", "REJECTED"]
const STATUS_TONE = { PENDING: "warning", APPROVED: "success", REJECTED: "neutral" } as const

export function VerificationsTab() {
  const [status, setStatus] = useState<VerificationStatus>("PENDING")
  const query = useQuery({
    queryKey: ["admin", "verifications", status],
    queryFn: ({ signal }) => browserFetchWithMeta<AdminVerificationItem[], PageMeta>("/admin/verifications", { query: { status, pageSize: 50 }, signal }),
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
        emptyIcon={BadgeCheck}
        emptyTitle={status === "PENDING" ? "Nothing waiting for review" : `No ${status.toLowerCase()} requests`}
        emptyDescription="KYC and identity requests from brands and creators land here."
      >
        {(d) => (
          <div className="space-y-4">
            {d.data.map((item) => (
              <VerificationCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </AdminSection>
    </div>
  )
}

function VerificationCard({ item }: { item: AdminVerificationItem }) {
  const who = item.brand?.companyName ?? item.user.name
  const details = Object.entries(item.details ?? {})
  return (
    <Panel
      title={`${who} · ${item.type.toLowerCase().replace(/_/g, " ")}`}
      description={`${item.user.email} · requested ${timeAgo(item.createdAt)} · KYC ${item.user.kycStatus.toLowerCase()}`}
      action={<Pill tone={STATUS_TONE[item.status]}>{item.status.toLowerCase()}</Pill>}
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3 text-sm">
          {item.creator && <p className="text-xs text-muted-foreground">Creator @{item.creator.handle}</p>}
          {item.brand?.gstin && <p className="text-xs text-muted-foreground">GSTIN {item.brand.gstin}</p>}
          {details.length > 0 && (
            <ul className="space-y-1 text-xs">
              {details.map(([k, v]) => (
                <li key={k} className="flex justify-between gap-3 rounded-md bg-muted/60 px-3 py-1.5">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="truncate font-mono">{String(v)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">{item.documentIds.length} document{item.documentIds.length === 1 ? "" : "s"} attached</p>
          {item.status !== "PENDING" && item.reviewerNote && (
            <p className="rounded-lg bg-muted/60 p-3 text-xs">
              <span className="font-medium">Note:</span> {item.reviewerNote}
            </p>
          )}
        </div>
        {item.status === "PENDING" && <DecisionForm verificationId={item.id} />}
      </div>
    </Panel>
  )
}

function DecisionForm({ verificationId }: { verificationId: string }) {
  const qc = useQueryClient()
  const { pending, run } = useApiAction()
  const [note, setNote] = useState("")

  const decide = (approve: boolean) =>
    void run(() => decideVerificationAction(verificationId, { approve, note: note.trim() }), {
      success: approve ? "Verification approved" : "Verification rejected",
      onSuccess: () => {
        setNote("")
        void qc.invalidateQueries({ queryKey: ["admin"] })
      },
    })

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <div className="space-y-1.5">
        <Label htmlFor={`verif-note-${verificationId}`}>Note (shared with the applicant)</Label>
        <Textarea id={`verif-note-${verificationId}`} rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Company name on the GST certificate matches the profile." />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" disabled={pending || note.trim().length === 0} onClick={() => decide(false)}>
          Reject
        </Button>
        <Button disabled={pending} onClick={() => decide(true)}>
          {pending && <Loader2 className="size-4 animate-spin" />} Approve
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">A rejection needs a note so the applicant knows what to fix.</p>
    </div>
  )
}
