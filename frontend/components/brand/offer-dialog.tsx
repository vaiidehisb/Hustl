"use client"

// Send an offer → POST /deals (createOfferRequest). The fee preview below is
// indicative only: payment-service recalculates and is authoritative.

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useFieldArray, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Info, Lock, Loader2, Plus, Send, ShieldCheck, Trash2 } from "lucide-react"
import {
  fundingBreakdown,
  MIN_DEAL_AMOUNT,
  PROCESSING_FEE_RATE,
  UPFRONT_MIN_RELIABILITY,
  type CreateOfferRequest,
  type PaymentMode,
} from "@hustl/contracts"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar } from "@/components/app/ui"
import { sendOfferAction } from "@/app/actions/brand"
import { inr } from "@/lib/format"
import { cn } from "@/lib/utils"
import { brandFeeRate, dateToIso } from "./helpers"

export type OfferCreator = {
  id: string
  name: string
  handle: string
  avatarUrl?: string | null
  /** 0–100; null when the creator has no score yet (upfront stays locked). */
  reliabilityScore?: number | null
}

export type OfferBrief = { id: string; title: string; deliverables?: { type: string; quantity: number }[]; budgetPerCreator?: number }

const NO_BRIEF = "none"

const offerForm = z.object({
  title: z.string().trim().min(3, "Give the offer a title").max(140),
  amount: z.coerce.number().int(`Enter a whole rupee amount`).min(MIN_DEAL_AMOUNT, `Deal value must be at least ₹${MIN_DEAL_AMOUNT}`),
  paymentMode: z.enum(["COMPLETION", "UPFRONT", "MILESTONES"]),
  milestones: z.array(z.object({ title: z.string().trim().min(2, "Name the milestone").max(140), percent: z.coerce.number().int().min(1).max(100) })).max(10),
  deliverables: z.string().trim().min(3, "List what the creator delivers").max(5000),
  dueDate: z.string().optional(),
  message: z.string().trim().max(4000).optional(),
  briefId: z.string(),
})
type OfferFormValues = z.input<typeof offerForm>
type OfferFormOutput = z.output<typeof offerForm>

export function OfferDialog({
  creator,
  brief,
  briefs = [],
  applicationId,
  amount: initialAmount,
  brandPlan,
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
  /** STARTER | GROWTH | ENTERPRISE — sets the indicative platform fee. */
  brandPlan: string
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
            brandPlan={brandPlan}
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
  brandPlan,
  kycVerified,
  onDone,
}: {
  creator: OfferCreator
  brief?: OfferBrief | null
  briefs: OfferBrief[]
  applicationId?: string | null
  initialAmount?: number | null
  brandPlan: string
  kycVerified: boolean
  onDone: () => void
}) {
  const router = useRouter()
  const allBriefs = useMemo(() => {
    const list = [...briefs]
    if (brief && !list.some((b) => b.id === brief.id)) list.unshift(brief)
    return list
  }, [brief, briefs])

  const form = useForm<OfferFormValues, unknown, OfferFormOutput>({
    resolver: zodResolver(offerForm),
    defaultValues: {
      title: brief ? brief.title : `Collaboration with @${creator.handle}`,
      amount: String(initialAmount ?? brief?.budgetPerCreator ?? "") as unknown as OfferFormValues["amount"],
      paymentMode: "MILESTONES",
      milestones: [
        { title: "Concept & script approval", percent: 30 },
        { title: "Content goes live", percent: 70 },
      ],
      deliverables: describeDeliverables(brief?.deliverables),
      dueDate: "",
      message: "",
      briefId: brief?.id ?? NO_BRIEF,
    },
  })
  const { control, register, handleSubmit, setValue, setError, watch, formState } = form
  const milestones = useFieldArray({ control, name: "milestones" })

  const mode = watch("paymentMode") as PaymentMode
  const rawAmount = watch("amount")
  const value = Math.max(0, Math.round(Number(rawAmount) || 0))
  const watchedMilestones = watch("milestones") ?? []
  const msTotal = watchedMilestones.reduce((s, m) => s + (Number(m.percent) || 0), 0)

  const feeRate = brandFeeRate(brandPlan)
  const fees = fundingBreakdown(value, feeRate)
  const reliability = creator.reliabilityScore ?? null
  const upfrontAllowed = reliability !== null && reliability > UPFRONT_MIN_RELIABILITY && kycVerified

  function pickBrief(id: string) {
    setValue("briefId", id)
    const b = allBriefs.find((x) => x.id === id)
    if (!b) return
    setValue("title", b.title)
    if (!watch("deliverables") && b.deliverables?.length) setValue("deliverables", describeDeliverables(b.deliverables))
    if (!Number(watch("amount")) && b.budgetPerCreator) setValue("amount", String(b.budgetPerCreator) as unknown as OfferFormValues["amount"])
  }

  const onSubmit = handleSubmit(async (values) => {
    const usesMilestones = values.paymentMode === "MILESTONES"
    if (usesMilestones && values.milestones.length < 2) {
      setError("milestones", { message: "Milestone payments need at least two milestones." })
      return
    }
    if (usesMilestones && msTotal !== 100) {
      setError("milestones", { message: "Milestone percentages must add up to 100." })
      return
    }

    const body: CreateOfferRequest = {
      creatorId: creator.id,
      briefId: values.briefId && values.briefId !== NO_BRIEF ? values.briefId : null,
      applicationId: applicationId ?? null,
      title: values.title,
      amount: values.amount,
      paymentMode: values.paymentMode,
      milestones: usesMilestones ? values.milestones.map((m) => ({ title: m.title, percent: m.percent, dueDate: null })) : [],
      deliverables: values.deliverables,
      dueDate: dateToIso(values.dueDate),
      message: values.message || undefined,
    }

    const res = await sendOfferAction(body)
    if (!res.ok) {
      const { code, message, fieldErrors } = res.error
      if (fieldErrors) {
        for (const [field, msg] of Object.entries(fieldErrors)) {
          const key = field.split(".")[0] as keyof OfferFormValues
          if (key in values) setError(key, { message: msg })
        }
      }
      toast.error(code === "CONFLICT" ? message : message, {
        description: code === "SERVICE_UNAVAILABLE" || code === "TIMEOUT" ? "The deal service didn't respond. Nothing was sent." : undefined,
      })
      return
    }
    toast.success(`Offer sent to ${creator.name}`, { description: "We'll notify you when they respond." })
    onDone()
    router.push(`/brand/deals/${res.data.id}`)
  })

  const pending = formState.isSubmitting

  return (
    <form onSubmit={onSubmit} className="space-y-6">
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
          <Input id="offer-title" {...register("title")} maxLength={140} aria-invalid={!!formState.errors.title} />
          <FieldError message={formState.errors.title?.message} />
        </div>
        {allBriefs.length > 0 && (
          <div className="space-y-1.5">
            <Label>Brief (optional)</Label>
            <Select value={watch("briefId")} onValueChange={pickBrief} disabled={!!applicationId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="No brief" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_BRIEF}>No brief — direct offer</SelectItem>
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
          <Input id="offer-amount" type="number" inputMode="numeric" min={MIN_DEAL_AMOUNT} step={1} placeholder="25000" aria-invalid={!!formState.errors.amount} {...register("amount")} />
          <FieldError message={formState.errors.amount?.message} />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Payment mode</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          <ModeOption active={mode === "COMPLETION"} onClick={() => setValue("paymentMode", "COMPLETION")} title="Full on completion" hint="Released after final approval" />
          <ModeOption
            active={mode === "UPFRONT"}
            onClick={() => upfrontAllowed && setValue("paymentMode", "UPFRONT")}
            disabled={!upfrontAllowed}
            title="Upfront"
            hint={upfrontAllowed ? "Released as soon as escrow funds" : "Locked for this deal"}
          />
          <ModeOption active={mode === "MILESTONES"} onClick={() => setValue("paymentMode", "MILESTONES")} title="Custom milestones" hint="Release in stages" />
        </div>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Lock className="mt-0.5 size-3 shrink-0" />
          Upfront release needs a verified brand{kycVerified ? " ✓" : " (request verification in Settings)"} and creator reliability above {UPFRONT_MIN_RELIABILITY}
          {reliability === null ? " (not scored yet)" : ` (${reliability}/100)`}.
        </p>
      </fieldset>

      {mode === "MILESTONES" && (
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Milestones</span>
            <span className={cn("tabular-nums", msTotal === 100 ? "text-success" : "text-destructive")}>{msTotal}% of 100%</span>
          </div>
          <div className="space-y-2">
            {milestones.fields.map((field, i) => (
              <div key={field.id} className="flex items-center gap-2">
                <Input aria-label={`Milestone ${i + 1} title`} placeholder="e.g. Draft video" className="h-8 bg-background" {...register(`milestones.${i}.title` as const)} />
                <div className="relative w-24 shrink-0">
                  <Input
                    aria-label={`Milestone ${i + 1} percent`}
                    type="number"
                    min={1}
                    max={100}
                    className="h-8 bg-background pr-6 tabular-nums"
                    {...register(`milestones.${i}.percent` as const)}
                  />
                  <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                </div>
                <span className="hidden w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block">
                  {inr(Math.round((value * (Number(watchedMilestones[i]?.percent) || 0)) / 100))}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  disabled={milestones.fields.length <= 2}
                  onClick={() => milestones.remove(i)}
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
            disabled={milestones.fields.length >= 10}
            onClick={() => milestones.append({ title: "", percent: Math.max(1, 100 - msTotal) })}
          >
            <Plus className="size-3.5" /> Add milestone
          </Button>
          <FieldError message={formState.errors.milestones?.message ?? formState.errors.milestones?.root?.message} />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
        <div className="space-y-1.5">
          <Label htmlFor="offer-deliverables">Deliverables</Label>
          <Textarea id="offer-deliverables" rows={2} placeholder="2 × Instagram Reel, 3 × Story with link sticker" aria-invalid={!!formState.errors.deliverables} {...register("deliverables")} />
          <FieldError message={formState.errors.deliverables?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="offer-due">Due date</Label>
          <Input id="offer-due" type="date" min={new Date().toISOString().slice(0, 10)} {...register("dueDate")} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="offer-message">First message</Label>
        <Textarea id="offer-message" rows={3} placeholder={`Hi ${creator.name.split(" ")[0]}, we loved your recent work and think you'd be a great fit…`} {...register("message")} />
      </div>

      <div className="rounded-lg border bg-card p-4 text-sm">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <ShieldCheck className="size-3.5 text-success" /> You pay into escrow when the contract is signed
        </div>
        <Row label="Deal value (held in escrow)" value={inr(fees.escrow)} />
        <Row label={`Platform fee (${Math.round(feeRate * 100)}% · ${brandPlan.toLowerCase()} plan)`} value={inr(fees.brandFee)} />
        <Row label={`Payment processing (${Math.round(PROCESSING_FEE_RATE * 100)}%)`} value={inr(fees.processingFee)} />
        <div className="mt-2 flex items-center justify-between border-t pt-2 font-semibold">
          <span>Total at funding</span>
          <span className="tabular-nums">{inr(fees.total)}</span>
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3 shrink-0" />
          Indicative — the final amount is calculated by hustl. when you fund. Nothing is charged now, and funds release only when you approve work.
        </p>
      </div>

      <DialogFooter className="gap-2 sm:gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Send offer{value >= MIN_DEAL_AMOUNT ? ` · ${inr(value)}` : ""}
        </Button>
      </DialogFooter>
    </form>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs font-medium text-destructive">{message}</p>
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
