"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Lightbulb, Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { applyToBriefAction } from "@/app/actions/creator"
import { CREATOR_FEE_RATE, payoutBreakdown } from "@hustl/contracts"
import { inr } from "@/lib/format"
import { cn } from "@/lib/utils"
import { MIN_RATE, PITCH_MAX, PITCH_MIN } from "./lib"

const SCORING_COPY: Record<string, string> = {
  scored: "Your fit score was calculated and shared with the brand.",
  queued: "This brief is busy — your fit score is being calculated and will appear on your application shortly.",
  failed: "We couldn't score this application just now. The brand still has your pitch; scoring is retried later.",
}

export function ApplyForm({ briefId, budget, brandName }: { briefId: string; budget: number; brandName: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [pitch, setPitch] = useState("")
  const [rate, setRate] = useState(budget > 0 ? String(budget) : "")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const len = pitch.trim().length
  const rateNum = Math.round(Number(rate) || 0)
  const { fee, net } = payoutBreakdown(rateNum)
  const overBudget = budget > 0 && rateNum > budget * 1.2
  const canSubmit = len >= PITCH_MIN && len <= PITCH_MAX && rateNum >= MIN_RATE && !pending

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setFieldErrors({})
    startTransition(async () => {
      const res = await applyToBriefAction(briefId, { pitch, proposedRate: rateNum })
      if (!res.ok) {
        setFieldErrors(res.error.fieldErrors ?? {})
        toast.error(res.error.message)
        return
      }
      const { application, aiScoring } = res.data
      toast.success(`Application sent to ${brandName}`, {
        description: aiScoring === "scored" && application.matchScore !== null ? `Fit score ${application.matchScore}/100 — ${SCORING_COPY.scored}` : SCORING_COPY[aiScoring],
      })
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="rounded-lg bg-accent/60 p-4 text-sm">
        <div className="mb-2 flex items-center gap-2 font-medium text-accent-foreground">
          <Lightbulb className="size-4" /> Pitches that get shortlisted
        </div>
        <ul className="space-y-1 text-muted-foreground">
          <li>• Open with a concrete content idea for their product — not your bio.</li>
          <li>• Point to one similar piece of work and what it achieved.</li>
          <li>• Say when you can deliver and on which platform.</li>
        </ul>
      </div>

      <div className="space-y-2">
        <div className="flex items-end justify-between gap-2">
          <Label htmlFor="pitch">Your pitch</Label>
          <span className={cn("text-xs tabular-nums", len > PITCH_MAX ? "text-destructive" : len >= PITCH_MIN ? "text-success" : "text-muted-foreground")} aria-live="polite">
            {len < PITCH_MIN ? `${PITCH_MIN - len} more to go` : `${len}/${PITCH_MAX}`}
          </span>
        </div>
        <Textarea
          id="pitch"
          value={pitch}
          onChange={(e) => setPitch(e.target.value)}
          rows={7}
          maxLength={PITCH_MAX + 200}
          placeholder={`Hi ${brandName} team — I'd create a 45-second reel showing…`}
          className="resize-y"
          aria-invalid={!!fieldErrors.pitch}
          aria-describedby={fieldErrors.pitch ? "pitch-error" : undefined}
        />
        {fieldErrors.pitch && (
          <p id="pitch-error" className="text-xs font-medium text-destructive">
            {fieldErrors.pitch}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="rate">Proposed rate</Label>
        <div className="relative max-w-xs">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
          <Input
            id="rate"
            inputMode="numeric"
            value={rate}
            onChange={(e) => setRate(e.target.value.replace(/[^\d]/g, ""))}
            className="pl-7 tabular-nums"
            placeholder="15000"
            aria-invalid={!!fieldErrors.proposedRate}
            aria-describedby={fieldErrors.proposedRate ? "rate-error" : undefined}
          />
        </div>
        {fieldErrors.proposedRate && (
          <p id="rate-error" className="text-xs font-medium text-destructive">
            {fieldErrors.proposedRate}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {rateNum > 0 ? (
            <>
              You&apos;d receive <span className="font-medium text-foreground">{inr(net)}</span> after the {inr(fee)} platform fee ({Math.round(CREATOR_FEE_RATE * 100)}%). Paid
              from escrow as milestones are approved.
            </>
          ) : (
            "Enter the amount you'd charge for this brief."
          )}
          {budget > 0 && <> Brand budget: {inr(budget)}.</>}
        </p>
        {overBudget && (
          <p className="rounded-md bg-warning-soft px-3 py-2 text-xs font-medium text-warning">
            That&apos;s more than 20% above the brand&apos;s budget. Justify the premium in your pitch, or you may be passed over.
          </p>
        )}
      </div>

      <Button type="submit" disabled={!canSubmit} className="w-full sm:w-auto">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        {pending ? "Sending…" : "Send application"}
      </Button>
    </form>
  )
}
