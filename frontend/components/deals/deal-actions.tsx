"use client"

import { useState } from "react"
import { Loader2, Plus, ShieldCheck, Star, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import {
  cancelDealAction,
  fundEscrowAction,
  leaveReviewAction,
  raiseDisputeAction,
  respondToOfferAction,
  signContractAction,
} from "@/app/actions/deals"
import { inr } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useAction } from "./use-action"

const Spinner = ({ on }: { on: boolean }) => (on ? <Loader2 className="size-4 animate-spin" /> : null)

export function OfferActions({
  dealId,
  amount,
  paymentMode,
  milestones,
  roundsLeft,
}: {
  dealId: string
  amount: number
  paymentMode: string
  milestones: { title: string; percent: number }[]
  roundsLeft: number
}) {
  const { pending, exec } = useAction()
  const [open, setOpen] = useState(false)
  const [counterAmount, setCounterAmount] = useState(amount)
  const [rows, setRows] = useState(milestones)
  const [note, setNote] = useState("")
  const total = rows.reduce((s, r) => s + (Number(r.percent) || 0), 0)
  const isMilestones = paymentMode === "MILESTONES"

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="ghost" disabled={pending} onClick={() => exec(() => respondToOfferAction(dealId, "DECLINE"), "Offer declined")}>
        Decline
      </Button>
      {roundsLeft > 0 && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" disabled={pending}>
              Counter
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Send a counter-offer</DialogTitle>
              <DialogDescription>
                {roundsLeft} round{roundsLeft === 1 ? "" : "s"} left. Be specific — clear reasoning gets accepted faster.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="counter-amount">Deal value (₹)</Label>
                <Input id="counter-amount" type="number" min={500} value={counterAmount} onChange={(e) => setCounterAmount(Number(e.target.value))} />
                <p className="text-xs text-muted-foreground">Currently {inr(amount)}</p>
              </div>
              {isMilestones && (
                <div className="space-y-2">
                  <Label>Milestones</Label>
                  {rows.map((r, i) => (
                    <div key={i} className="flex gap-2">
                      <Input value={r.title} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                      <div className="relative w-24 shrink-0">
                        <Input type="number" value={r.percent} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, percent: Number(e.target.value) } : x)))} className="pr-7" />
                        <span className="absolute right-2.5 top-2 text-sm text-muted-foreground">%</span>
                      </div>
                      <Button variant="ghost" size="icon" disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove milestone">
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between">
                    <Button variant="ghost" size="sm" onClick={() => setRows([...rows, { title: "New milestone", percent: 0 }])}>
                      <Plus className="size-4" /> Add milestone
                    </Button>
                    <span className={cn("text-xs font-medium", total === 100 ? "text-success" : "text-destructive")}>{total}% of 100%</span>
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="counter-note">Note</Label>
                <Textarea id="counter-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Adding a third story covers the extra usage rights you asked for." />
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={pending || (isMilestones && total !== 100)}
                onClick={() => exec(() => respondToOfferAction(dealId, "COUNTER", { amount: counterAmount, milestones: rows, note }), "Counter-offer sent", () => setOpen(false))}
              >
                <Spinner on={pending} /> Send counter
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      <Button disabled={pending} onClick={() => exec(() => respondToOfferAction(dealId, "ACCEPT"), "Offer accepted — contract is ready")}>
        <Spinner on={pending} /> Accept offer
      </Button>
    </div>
  )
}

export function SignContract({ dealId, signerName }: { dealId: string; signerName: string }) {
  const { pending, exec } = useAction()
  const [typed, setTyped] = useState("")
  const [open, setOpen] = useState(false)
  const matches = typed.trim().toLowerCase() === signerName.trim().toLowerCase()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Sign contract</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign the contract</DialogTitle>
          <DialogDescription>Type your full name exactly as shown to apply your e-signature. Read the contract terms on this page first.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="sig">Full name — {signerName}</Label>
          <Input id="sig" value={typed} onChange={(e) => setTyped(e.target.value)} className="font-display text-lg italic" autoComplete="off" />
        </div>
        <DialogFooter>
          <Button disabled={!matches || pending} onClick={() => exec(() => signContractAction(dealId), "Contract signed", () => setOpen(false))}>
            <Spinner on={pending} /> Sign as {signerName}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function FundEscrow({
  dealId,
  breakdown,
  brandFeePct,
  onHold,
}: {
  dealId: string
  breakdown: { escrow: number; brandFee: number; processing: number; total: number }
  brandFeePct: number
  onHold: boolean
}) {
  const { pending, exec } = useAction()
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={onHold}>{onHold ? "On safety hold (24h)" : `Fund ${inr(breakdown.total)}`}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fund escrow</DialogTitle>
          <DialogDescription>The deal value is held in escrow and released milestone by milestone as you approve work.</DialogDescription>
        </DialogHeader>
        <dl className="space-y-2 rounded-lg border p-4 text-sm">
          <div className="flex justify-between"><dt>Held in escrow</dt><dd className="tabular-nums">{inr(breakdown.escrow)}</dd></div>
          <div className="flex justify-between text-muted-foreground"><dt>Platform fee ({Math.round(brandFeePct * 100)}%)</dt><dd className="tabular-nums">{inr(breakdown.brandFee)}</dd></div>
          <div className="flex justify-between text-muted-foreground"><dt>Payment processing (2%)</dt><dd className="tabular-nums">{inr(breakdown.processing)}</dd></div>
          <div className="flex justify-between border-t pt-2 font-semibold"><dt>Total today</dt><dd className="tabular-nums">{inr(breakdown.total)}</dd></div>
        </dl>
        <p className="flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
          <ShieldCheck className="size-4" /> Test mode — no real money moves. Stripe Connect / Razorpay checkout replaces this step in production.
        </p>
        <DialogFooter>
          <Button disabled={pending} onClick={() => exec(() => fundEscrowAction(dealId), "Escrow funded — the creator can start", () => setOpen(false))}>
            <Spinner on={pending} /> Pay {inr(breakdown.total)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CancelDeal({ dealId }: { dealId: string }) {
  const { pending, exec } = useAction()
  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={() => confirm("Cancel this deal? This can't be undone.") && exec(() => cancelDealAction(dealId), "Deal cancelled")}>
      Cancel deal
    </Button>
  )
}

export function DisputeDialog({ dealId, milestones }: { dealId: string; milestones: { id: string; title: string }[] }) {
  const { pending, exec } = useAction()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [milestoneId, setMilestoneId] = useState(milestones[0]?.id ?? "")
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full text-destructive hover:text-destructive">
          Raise a dispute
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Raise a dispute</DialogTitle>
          <DialogDescription>All pending releases on this deal freeze until the trust team decides. Share what was agreed and what happened.</DialogDescription>
        </DialogHeader>
        {milestones.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="dispute-ms">Milestone</Label>
            <select id="dispute-ms" value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="dispute-reason">What went wrong?</Label>
          <Textarea id="dispute-reason" rows={5} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="destructive" disabled={pending || reason.trim().length < 20} onClick={() => exec(() => raiseDisputeAction(dealId, reason, milestoneId || null), "Dispute raised — releases frozen", () => setOpen(false))}>
            <Spinner on={pending} /> Submit dispute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ReviewForm({ dealId, subjectName }: { dealId: string; subjectName: string }) {
  const { pending, exec } = useAction()
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState("")
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Leave a review</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review {subjectName}</DialogTitle>
          <DialogDescription>Reviews are public on their profile and feed into trust scores.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} onClick={() => setRating(n)} className="p-1">
              <Star className={cn("size-7", n <= rating ? "fill-warning text-warning" : "text-muted-foreground")} />
            </button>
          ))}
        </div>
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What stood out about working together?" />
        <DialogFooter>
          <Button disabled={pending} onClick={() => exec(() => leaveReviewAction(dealId, rating, comment), "Thanks for the review!", () => setOpen(false))}>
            <Spinner on={pending} /> Post review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
