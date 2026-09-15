"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Info, Lock, Loader2, Plus, Send, ShieldCheck, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar } from "@/components/app/ui"
import { createOfferAction } from "@/app/actions/deals"
import { fundingBreakdown, UPFRONT_MIN_RELIABILITY, type MilestoneInput } from "@/lib/payments/fees"
import { inr } from "@/lib/format"
import { cn } from "@/lib/utils"

export type OfferCreator = {
  id: string
  name: string
  handle: string
  avatarUrl?: string | null
  reliabilityScore: number
}

export type OfferBrief = { id: string; title: string; deliverables?: { type: string; quantity: number }[]; budgetPerCreator?: number }

type Mode = "COMPLETION" | "UPFRONT" | "MILESTONES"

export function OfferDialog({
  creator,
  brief,
  briefs = [],
  applicationId,
  amount: initialAmount,
  brandFeePct,
  kycVerified,
  trigger,
  size = "sm",
  variant = "default",
  label = "Send offer",
  className,
}: {
  creator: OfferCreator
  brief?: OfferBrief | null
  /** Live briefs the brand can attach the offer to. */
  briefs?: OfferBrief[]
  applicationId?: string | null
  amount?: number | null
  brandFeePct: number
  kycVerified: boolean
  trigger?: React.ReactNode
  size?: "sm" | "default" | "lg"
  variant?: "default" | "outline" | "secondary" | "ghost"
  label?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size={size} variant={variant} className={className}>
            <Send className="size-3.5" />
            {label}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        {open && (
          <OfferForm
            creator={creator}
            brief={brief}
            briefs={briefs}
            applicationId={applicationId}
            initialAmount={initialAmount}
            brandFeePct={brandFeePct}
            kycVerified={kycVerified}
            onDone={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

const describeDeliverables = (d?: { type: string; quantity: number }[]) => (d ?? []).map((x) => `${x.quantity} × ${x.type}`).join(", ")

function OfferForm({
  creator,
  brief,
  briefs,
  applicationId,
  initialAmount,
  brandFeePct,
  kycVerified,
  onDone,
}: {
  creator: OfferCreator
  brief?: OfferBrief | null
  briefs: OfferBrief[]
  applicationId?: string | null
  initialAmount?: number | null
  brandFeePct: number
  kycVerified: boolean
  onDone: () => void
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const allBriefs = useMemo(() => {
    const list = [...briefs]
    if (brief && !list.some((b) => b.id === brief.id)) list.unshift(brief)
    return list
  }, [brief, briefs])

  const [briefId, setBriefId] = useState<string>(brief?.id ?? "none")
  const selected = allBriefs.find((b) => b.id === briefId)
  const [title, setTitle] = useState(brief ? brief.title : `Collaboration with @${creator.handle}`)
  const [amount, setAmount] = useState<string>(String(initialAmount ?? brief?.budgetPerCreator ?? ""))
  const [mode, setMode] = useState<Mode>("MILESTONES")
  const [milestones, setMilestones] = useState<MilestoneInput[]>([
    { title: "Concept & script approval", percent: 30 },
    { title: "Content goes live", percent: 70 },
  ])
  const [deliverables, setDeliverables] = useState(describeDeliverables(brief?.deliverables))
  const [dueDate, setDueDate] = useState("")
  const [message, setMessage] = useState("")

  const upfrontAllowed = creator.reliabilityScore > UPFRONT_MIN_RELIABILITY && kycVerified
  const value = Math.max(0, Math.round(Number(amount) || 0))
  const fees = fundingBreakdown(value, brandFeePct)
  const msTotal = milestones.reduce((s, m) => s + (Number(m.percent) || 0), 0)
  const msValid = mode !== "MILESTONES" || (msTotal === 100 && milestones.every((m) => m.title.trim() && m.percent > 0))

  function pickBrief(id: string) {
    setBriefId(id)
    const b = allBriefs.find((x) => x.id === id)
    if (!b) return
    setTitle(b.title)
    if (!deliverables && b.deliverables?.length) setDeliverables(describeDeliverables(b.deliverables))
    if (!amount && b.budgetPerCreator) setAmount(String(b.budgetPerCreator))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return toast.error("Give the offer a title.")
    if (value < 500) return toast.error("Deal value must be at least ₹500.")
    if (!deliverables.trim()) return toast.error("List the deliverables so the creator knows what's expected.")
    if (!msValid) return toast.error("Milestones need titles and must add up to exactly 100%.")
    start(async () => {
      const res = await createOfferAction({
        creatorId: creator.id,
        briefId: selected ? selected.id : null,
        applicationId: applicationId ?? null,
        title: title.trim(),
        amount: value,
        paymentMode: mode,
        milestones: mode === "MILESTONES" ? milestones.map((m) => ({ ...m, title: m.title.trim(), percent: Number(m.percent) })) : [],
        deliverables: deliverables.trim(),
        dueDate: dueDate || null,
        message: message.trim() || undefined,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Offer sent to ${creator.name}`, { description: "We'll notify you when they respond." })
      onDone()
      if (res.data) router.push(`/brand/deals/${res.data.id}`)
    })
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <DialogHeader>
        <DialogTitle>Send an offer</DialogTitle>
        <DialogDescription className="flex items-center gap-2">
          <Avatar name={creator.name} src={creator.avatarUrl} size={22} />
          <span>
            to <span className="font-medium text-foreground">{creator.name}</span> · @{creator.handle}
          </span>
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="offer-title">Title</Label>
          <Input id="offer-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
        </div>
        {allBriefs.length > 0 && (
          <div className="space-y-1.5">
            <Label>Brief (optional)</Label>
            <Select value={briefId} onValueChange={pickBrief} disabled={!!applicationId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="No brief" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No brief — direct offer</SelectItem>
                {allBriefs.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className={cn("space-y-1.5", allBriefs.length === 0 && "sm:col-span-2")}>
          <Label htmlFor="offer-amount">Deal value (₹)</Label>
          <Input
            id="offer-amount"
            inputMode="numeric"
            type="number"
            min={500}
            step={500}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="25000"
            required
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Payment mode</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          <ModeOption active={mode === "COMPLETION"} onClick={() => setMode("COMPLETION")} title="Full on completion" hint="Released after final approval" />
          <ModeOption
            active={mode === "UPFRONT"}
            onClick={() => upfrontAllowed && setMode("UPFRONT")}
            disabled={!upfrontAllowed}
            title="Upfront"
            hint={upfrontAllowed ? "Released as soon as escrow funds" : "Locked for this deal"}
          />
          <ModeOption active={mode === "MILESTONES"} onClick={() => setMode("MILESTONES")} title="Custom milestones" hint="Release in stages" />
        </div>
        {!upfrontAllowed && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Lock className="mt-0.5 size-3 shrink-0" />
            Upfront release needs a KYC-verified brand{kycVerified ? " ✓" : " (verify in Settings)"} and creator reliability above {UPFRONT_MIN_RELIABILITY} (
            {creator.reliabilityScore}/100).
          </p>
        )}
      </fieldset>

      {mode === "MILESTONES" && (
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Milestones</span>
            <span className={cn("tabular-nums", msTotal === 100 ? "text-success" : "text-destructive")}>{msTotal}% of 100%</span>
          </div>
          <div className="space-y-2">
            {milestones.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  aria-label={`Milestone ${i + 1} title`}
                  value={m.title}
                  onChange={(e) => setMilestones((ms) => ms.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                  placeholder="e.g. Draft video"
                  className="h-8 bg-background"
                />
                <div className="relative w-24 shrink-0">
                  <Input
                    aria-label={`Milestone ${i + 1} percent`}
                    type="number"
                    min={1}
                    max={100}
                    value={m.percent || ""}
                    onChange={(e) => setMilestones((ms) => ms.map((x, j) => (j === i ? { ...x, percent: Number(e.target.value) } : x)))}
                    className="h-8 bg-background pr-6 tabular-nums"
                  />
                  <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                </div>
                <span className="hidden w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block">
                  {inr(Math.round((value * (m.percent || 0)) / 100))}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  disabled={milestones.length <= 1}
                  onClick={() => setMilestones((ms) => ms.filter((_, j) => j !== i))}
                  aria-label="Remove milestone"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2"
            disabled={milestones.length >= 6}
            onClick={() => setMilestones((ms) => [...ms, { title: "", percent: Math.max(0, 100 - msTotal) }])}
          >
            <Plus className="size-3.5" /> Add milestone
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
        <div className="space-y-1.5">
          <Label htmlFor="offer-deliverables">Deliverables</Label>
          <Textarea
            id="offer-deliverables"
            value={deliverables}
            onChange={(e) => setDeliverables(e.target.value)}
            rows={2}
            placeholder="2 × Instagram Reel, 3 × Story with link sticker"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="offer-due">Due date</Label>
          <Input id="offer-due" type="date" value={dueDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="offer-message">First message</Label>
        <Textarea
          id="offer-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder={`Hi ${creator.name.split(" ")[0]}, we loved your recent work and think you'd be a great fit…`}
        />
      </div>

      <div className="rounded-lg border bg-card p-4 text-sm">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <ShieldCheck className="size-3.5 text-success" /> You pay into escrow when the contract is signed
        </div>
        <Row label="Deal value (held in escrow)" value={inr(fees.escrow)} />
        <Row label={`Platform fee (${Math.round(brandFeePct * 100)}%)`} value={inr(fees.brandFee)} />
        <Row label="Payment processing (2%)" value={inr(fees.processing)} />
        <div className="mt-2 flex items-center justify-between border-t pt-2 font-semibold">
          <span>Total at funding</span>
          <span className="tabular-nums">{inr(fees.total)}</span>
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3 shrink-0" />
          Nothing is charged now. Funds release to the creator only when you approve each milestone.
        </p>
      </div>

      <DialogFooter className="gap-2 sm:gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !msValid}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Send offer{value >= 500 ? ` · ${inr(value)}` : ""}
        </Button>
      </DialogFooter>
    </form>
  )
}

function ModeOption({ active, disabled, onClick, title, hint }: { active: boolean; disabled?: boolean; onClick: () => void; title: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "rounded-lg border p-3 text-left transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50",
        disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
      )}
    >
      <div className="flex items-center gap-1.5 text-sm font-medium">
        {disabled && <Lock className="size-3" />}
        {title}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
    </button>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </div>
  )
}
