"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { resolveDisputeAction } from "@/app/actions/deals"
import { clearCreatorFlagsAction } from "@/app/actions/admin"
import { useAction } from "@/components/deals/use-action"

export function ResolveDispute({ disputeId }: { disputeId: string }) {
  const { pending, exec } = useAction()
  const [note, setNote] = useState("")
  const ready = note.trim().length >= 10
  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <Label htmlFor={`note-${disputeId}`}>Decision note (shared with both parties)</Label>
      <Textarea id={`note-${disputeId}`} rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Deliverable matches the agreed brief except…" />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" disabled={!ready || pending} onClick={() => exec(() => resolveDisputeAction(disputeId, "REFUND_TO_BRAND", note), "Refunded to brand")}>
          Refund brand
        </Button>
        <Button disabled={!ready || pending} onClick={() => exec(() => resolveDisputeAction(disputeId, "RELEASE_TO_CREATOR", note), "Released to creator")}>
          Release to creator
        </Button>
      </div>
    </div>
  )
}

export function ClearFlagsButton({ creatorId }: { creatorId: string }) {
  const { pending, exec } = useAction()
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => exec(() => clearCreatorFlagsAction(creatorId), "Creator cleared")}>
      Mark reviewed
    </Button>
  )
}
