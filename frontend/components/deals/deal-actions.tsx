"use client"
// Every control here is rendered only when the server put the matching value in
// `deal.allowedActions` / `milestone.allowedActions`. Nothing infers permissions.
import { useState } from "react"
import { Loader2, Plus, Star, Trash2 } from "lucide-react"
import type { CounterOfferRequest, DealDetail, DealUiAction, MilestoneInput, PaymentMode } from "@hustl/contracts"
import { MAX_COUNTER_ROUNDS } from "@hustl/contracts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import {
  acceptOfferAction,
  cancelDealAction,
  counterOfferAction,
  declineOfferAction,
  getContractAction,
  openDisputeAction,
  reviewDealAction,
  signContractAction,
} from "@/app/actions/deals"
import { inr } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useApiAction } from "./use-deal-action"

const Spinner = ({ on }: { on: boolean }) => (on ? <Loader2 className="size-4 animate-spin" /> : null)

const latestOffer = (deal: DealDetail) => [...deal.offers].sort((a, b) => b.round - a.round)[0]

/** Renders the deal-level controls the caller is allowed to take. */
export function DealActionBar({ deal, signerName, only, className }: { deal: DealDetail; signerName: string; only?: DealUiAction[]; className?: string }) {
  const can = (a: DealUiAction) => deal.allowedActions.includes(a) && (!only || only.includes(a))
  if (!deal.allowedActions.some((a) => !only || only.includes(a))) return null
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {can("DECLINE") && <DeclineOffer dealId={deal.id} />}
      {can("CANCEL") && <CancelDeal dealId={deal.id} />}
      {can("COUNTER") && <CounterOfferDialog deal={deal} />}
      {can("ACCEPT") && <AcceptOffer dealId={deal.id} />}
      {can("SIGN") && <SignContractDialog deal={deal} signerName={signerName} />}
      {can("REVIEW") && <ReviewDialog dealId={deal.id} subjectName={counterpartName(deal)} />}
    </div>
  )
}

const counterpartName = (deal: DealDetail) => (deal.yourParty === "BRAND" ? deal.creator.name : deal.brand.companyName)

export function AcceptOffer({ dealId }: { dealId: string }) {
  const { pending, run } = useApiAction()
  return (
    <Button disabled={pending} onClick={() => void run(() => acceptOfferAction(dealId), { success: "Offer accepted — the contract is ready to sign" })}>
      <Spinner on={pending} /> Accept offer
    </Button>
  )
}

export function DeclineOffer({ dealId }: { dealId: string }) {
  const { pending, run } = useApiAction()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" disabled={pending}>
          Decline
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decline this offer?</DialogTitle>
          <DialogDescription>The other party is notified. A short reason helps them come back with something workable.</DialogDescription>
        </DialogHeader>
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="The rate doesn't cover the usage rights requested." />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Keep negotiating
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => void run(() => declineOfferAction(dealId, reason.trim() || undefined), { success: "Offer declined", onSuccess: () => setOpen(false) })}
          >
            <Spinner on={pending} /> Decline offer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CancelDeal({ dealId }: { dealId: string }) {
  const { pending, run } = useApiAction()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={pending}>
          Cancel deal
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this deal?</DialogTitle>
          <DialogDescription>Deals can only be cancelled before escrow is funded. This can't be undone.</DialogDescription>
        </DialogHeader>
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Campaign was pulled forward and no longer needs this creator." />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Keep the deal
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => void run(() => cancelDealAction(dealId, reason.trim() || undefined), { success: "Deal cancelled", onSuccess: () => setOpen(false) })}
          >
            <Spinner on={pending} /> Cancel deal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Counter offer ───────────────────────────────────────────────────────────

type Row = { title: string; percent: number; dueDate?: string | null }

export function CounterOfferDialog({ deal }: { deal: DealDetail }) {
  const offer = latestOffer(deal)
  const { pending, run } = useApiAction()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(offer?.amount ?? deal.amount)
  const [rows, setRows] = useState<Row[]>(
    (offer?.milestones?.length ? offer.milestones : deal.milestones.map((m) => ({ title: m.title, percent: m.percent, dueDate: m.dueDate }))).map((m) => ({
      title: m.title,
      percent: m.percent,
      dueDate: m.dueDate ?? null,
    })),
  )
  const [note, setNote] = useState("")
  const mode: PaymentMode = offer?.paymentMode ?? deal.paymentMode
  const isMilestones = mode === "MILESTONES"
  const total = rows.reduce((s, r) => s + (Number(r.percent) || 0), 0)
  const roundsLeft = deal.counterRoundsRemaining
  const valid = amount >= 500 && (!isMilestones || (total === 100 && rows.length >= 2 && rows.every((r) => r.title.trim().length >= 2)))

  const submit = () => {
    const body: CounterOfferRequest = {
      amount: Math.round(amount),
      paymentMode: mode,
      ...(isMilestones ? { milestones: rows.map((r): MilestoneInput => ({ title: r.title.trim(), percent: Number(r.percent), dueDate: r.dueDate ?? null })) } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    }
    void run(() => counterOfferAction(deal.id, body), { success: "Counter-offer sent", onSuccess: () => setOpen(false) })
  }

  return (
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
            {roundsLeft} counter round{roundsLeft === 1 ? "" : "s"} left of {MAX_COUNTER_ROUNDS}. Be specific — clear reasoning gets accepted faster.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="counter-amount">Deal value (₹)</Label>
            <Input id="counter-amount" type="number" min={500} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            <p className="text-xs text-muted-foreground">Currently {inr(offer?.amount ?? deal.amount)}</p>
          </div>
          {isMilestones && (
            <div className="space-y-2">
              <Label>Milestones</Label>
              {rows.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <Input aria-label={`Milestone ${i + 1} title`} value={r.title} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                  <div className="relative w-20 shrink-0 sm:w-24">
                    <Input
                      aria-label={`Milestone ${i + 1} percent`}
                      type="number"
                      value={r.percent}
                      onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, percent: Number(e.target.value) } : x)))}
                      className="pr-7"
                    />
                    <span className="absolute right-2.5 top-2 text-sm text-muted-foreground">%</span>
                  </div>
                  <Button variant="ghost" size="icon" disabled={rows.length <= 2} onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={`Remove milestone ${i + 1}`}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => setRows([...rows, { title: "New milestone", percent: 0 }])}>
                  <Plus className="size-4" /> Add milestone
                </Button>
                <span className={cn("text-xs font-medium tabular-nums", total === 100 ? "text-success" : "text-destructive")}>{total}% of 100%</span>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="counter-note">Note</Label>
            <Textarea id="counter-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Adding a third story covers the extra usage rights you asked for." />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={pending || !valid} onClick={submit}>
            <Spinner on={pending} /> Send counter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Contract signature ──────────────────────────────────────────────────────

export function SignContractDialog({ deal, signerName }: { deal: DealDetail; signerName: string }) {
  const { pending, run } = useApiAction()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState("")
  const [hash, setHash] = useState(deal.contract?.bodyHash)
  const [stale, setStale] = useState(false)
  const matches = typed.trim().toLowerCase() === signerName.trim().toLowerCase()

  const sign = () =>
    void run(() => signContractAction(deal.id, signerName.trim(), hash), {
      success: "Contract signed",
      onSuccess: () => setOpen(false),
      onError: (fail) => {
        // 409: the terms changed since this page was rendered — re-read the hash.
        if (fail.status !== 409) return false
        setStale(true)
        void getContractAction(deal.id).then((res) => res.ok && setHash(res.data.bodyHash))
        return true
      },
    })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={pending}>Sign contract</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign the contract</DialogTitle>
          <DialogDescription>Read the terms on this page, then type your full name exactly as shown to apply your e-signature.</DialogDescription>
        </DialogHeader>
        {stale && (
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
            The contract changed since you opened it. Refresh the page to read the current terms before signing.
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="signature">Full name — {signerName}</Label>
          <Input id="signature" value={typed} onChange={(e) => setTyped(e.target.value)} className="font-display text-lg italic" autoComplete="off" />
        </div>
        <DialogFooter>
          <Button disabled={!matches || pending || stale} onClick={sign}>
            <Spinner on={pending} /> Sign as {signerName}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Dispute & review ────────────────────────────────────────────────────────

export function DisputeDialog({ dealId, milestones, windowHours }: { dealId: string; milestones: { id: string; title: string }[]; windowHours: number }) {
  const { pending, run } = useApiAction()
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
          <DialogDescription>
            Disputes can be raised within {windowHours}h of a submission. All pending releases freeze until the hustl. trust team decides — share what was agreed and what happened.
          </DialogDescription>
        </DialogHeader>
        {milestones.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="dispute-milestone">Milestone</Label>
            <select
              id="dispute-milestone"
              value={milestoneId}
              onChange={(e) => setMilestoneId(e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-base sm:h-9 sm:text-sm"
            >
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
          <p className="text-xs text-muted-foreground">{reason.trim().length}/10 characters minimum</p>
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={pending || reason.trim().length < 10}
            onClick={() =>
              void run(() => openDisputeAction(dealId, { reason: reason.trim(), evidenceIds: [], ...(milestoneId ? { milestoneId } : {}) }), {
                success: "Dispute raised — releases are frozen",
                onSuccess: () => setOpen(false),
              })
            }
          >
            <Spinner on={pending} /> Submit dispute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ReviewDialog({ dealId, subjectName }: { dealId: string; subjectName: string }) {
  const { pending, run } = useApiAction()
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
            <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n === 1 ? "" : "s"}`} onClick={() => setRating(n)} className="p-1">
              <Star className={cn("size-7", n <= rating ? "fill-warning text-warning" : "text-muted-foreground")} />
            </button>
          ))}
        </div>
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What stood out about working together?" />
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() => void run(() => reviewDealAction(dealId, { rating, comment: comment.trim() }), { success: "Thanks for the review!", onSuccess: () => setOpen(false) })}
          >
            <Spinner on={pending} /> Post review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
