"use client"
// Escrow funding: POST /payments/deals/:id/intent, then branch on the provider
// the backend chose (TEST sandbox / Stripe Payment Element / Razorpay Checkout).
// After a confirmation we poll GET /deals/:id until the deal reaches IN_PROGRESS.
import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, ShieldCheck, TriangleAlert } from "lucide-react"
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js"
import { loadStripe, type Stripe } from "@stripe/stripe-js"
import type { DealDetail, FundingBreakdown } from "@hustl/contracts"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { browserFetch } from "@/lib/api/browser"
import { confirmTestPaymentAction, createFundingIntentAction, refreshDealAction } from "@/app/actions/deals"
import { inr } from "@/lib/format"
import { selectCheckoutFlow, type CheckoutFlow } from "./checkout"
import { actionErrorMessage } from "./use-deal-action"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const POLL_TRIES = 40
const POLL_MS = 1500

/** Poll the deal until the funding event has been consumed (FUNDED → IN_PROGRESS). */
async function waitForInProgress(dealId: string): Promise<boolean> {
  for (let i = 0; i < POLL_TRIES; i++) {
    try {
      const deal = await browserFetch<DealDetail>(`/deals/${encodeURIComponent(dealId)}`)
      if (deal.status === "IN_PROGRESS" || deal.status === "COMPLETED") return true
    } catch {
      // transient: keep polling
    }
    await sleep(POLL_MS)
  }
  return false
}

type Phase = { kind: "idle" } | { kind: "loading" } | { kind: "checkout"; flow: CheckoutFlow } | { kind: "settling"; note: string } | { kind: "error"; message: string }

export function FundEscrowDialog({ deal, funding, disabled }: { deal: DealDetail; funding: FundingBreakdown | null; disabled?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>({ kind: "idle" })
  const total = funding?.total ?? deal.amount

  const settle = useCallback(
    async (note: string) => {
      setPhase({ kind: "settling", note })
      const ok = await waitForInProgress(deal.id)
      await refreshDealAction(deal.id)
      router.refresh()
      if (ok) setOpen(false)
      else setPhase({ kind: "error", message: "Payment went through but the deal hasn't updated yet. It usually lands within a minute — refresh to check." })
    },
    [deal.id, router],
  )

  const start = async () => {
    setPhase({ kind: "loading" })
    const res = await createFundingIntentAction(deal.id)
    if (!res.ok) return setPhase({ kind: "error", message: actionErrorMessage(res) })
    const flow = selectCheckoutFlow(res.data)
    if (flow.kind === "SETTLED") return void settle("This payment was already confirmed — finishing up.")
    setPhase({ kind: "checkout", flow })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setPhase({ kind: "idle" })
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={disabled}>{disabled ? "On safety hold" : `Fund ${inr(total)}`}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Fund escrow</DialogTitle>
          <DialogDescription>The deal value is held in escrow and released milestone by milestone as you approve the work.</DialogDescription>
        </DialogHeader>

        {funding && (
          <dl className="space-y-2 rounded-lg border p-4 text-sm">
            <Line k="Held in escrow" v={inr(funding.escrow)} />
            <Line k="Platform fee" v={inr(funding.brandFee)} muted />
            <Line k="Payment processing" v={inr(funding.processingFee)} muted />
            <div className="flex justify-between border-t pt-2 font-semibold">
              <dt>Total today</dt>
              <dd className="tabular-nums">{inr(funding.total)}</dd>
            </div>
          </dl>
        )}

        {phase.kind === "error" && (
          <p className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {phase.message}
          </p>
        )}

        {phase.kind === "settling" && (
          <p className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs text-accent-foreground">
            <Loader2 className="size-4 animate-spin" /> {phase.note}
          </p>
        )}

        {phase.kind === "checkout" && <CheckoutStep dealId={deal.id} flow={phase.flow} onDone={settle} onError={(message) => setPhase({ kind: "error", message })} />}

        {(phase.kind === "idle" || phase.kind === "error") && (
          <DialogFooter>
            <Button onClick={start}>{phase.kind === "error" ? "Try again" : "Continue to payment"}</Button>
          </DialogFooter>
        )}
        {phase.kind === "loading" && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Preparing a secure payment…
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Line({ k, v, muted }: { k: string; v: string; muted?: boolean }) {
  return (
    <div className={`flex justify-between${muted ? " text-muted-foreground" : ""}`}>
      <dt>{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  )
}

function CheckoutStep({ dealId, flow, onDone, onError }: { dealId: string; flow: CheckoutFlow; onDone: (note: string) => void; onError: (message: string) => void }) {
  switch (flow.kind) {
    case "TEST":
      return <TestCheckout dealId={dealId} intentId={flow.intentId} onDone={onDone} onError={onError} />
    case "STRIPE":
      return <StripeCheckout clientSecret={flow.clientSecret} publishableKey={flow.publishableKey} onDone={onDone} onError={onError} />
    case "RAZORPAY":
      return <RazorpayCheckout flow={flow} onDone={onDone} onError={onError} />
    case "UNAVAILABLE":
      return (
        <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {flow.reason}
        </p>
      )
    default:
      return null
  }
}

// ─── TEST provider ───────────────────────────────────────────────────────────

function TestCheckout({ dealId, intentId, onDone, onError }: { dealId: string; intentId: string; onDone: (note: string) => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <span>
          <strong>Test mode</strong> — this sandbox provider simulates the payment. No real money moves and no card details are collected.
        </span>
      </p>
      <DialogFooter>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            const res = await confirmTestPaymentAction(dealId, intentId)
            setBusy(false)
            if (!res.ok) return onError(actionErrorMessage(res))
            onDone("Test payment confirmed — waiting for escrow to settle…")
          }}
        >
          {busy && <Loader2 className="size-4 animate-spin" />} Confirm test payment
        </Button>
      </DialogFooter>
    </div>
  )
}

// ─── Stripe ──────────────────────────────────────────────────────────────────

const stripeCache = new Map<string, Promise<Stripe | null>>()
const stripeFor = (key: string) => {
  if (!stripeCache.has(key)) stripeCache.set(key, loadStripe(key))
  return stripeCache.get(key)!
}

function StripeCheckout({ clientSecret, publishableKey, onDone, onError }: { clientSecret: string; publishableKey: string; onDone: (n: string) => void; onError: (m: string) => void }) {
  return (
    <Elements stripe={stripeFor(publishableKey)} options={{ clientSecret, appearance: { theme: "stripe" } }}>
      <StripeForm onDone={onDone} onError={onError} />
    </Elements>
  )
}

function StripeForm({ onDone, onError }: { onDone: (n: string) => void; onError: (m: string) => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)

  const pay = async () => {
    if (!stripe || !elements) return
    setBusy(true)
    const { error } = await stripe.confirmPayment({ elements, redirect: "if_required" })
    setBusy(false)
    if (error) return onError(error.message ?? "The card was declined. Try another payment method.")
    onDone("Payment confirmed — waiting for escrow to settle…")
  }

  return (
    <div className="space-y-3">
      <PaymentElement />
      <DialogFooter>
        <Button disabled={!stripe || busy} onClick={pay}>
          {busy && <Loader2 className="size-4 animate-spin" />} Pay securely
        </Button>
      </DialogFooter>
    </div>
  )
}

// ─── Razorpay ────────────────────────────────────────────────────────────────

const RAZORPAY_SRC = "https://checkout.razorpay.com/v1/checkout.js"

type RazorpayOptions = {
  key: string
  order_id: string
  amount: number
  currency: string
  name: string
  description: string
  handler: () => void
  modal?: { ondismiss?: () => void }
}
type RazorpayCtor = new (options: RazorpayOptions) => { open: () => void }

function loadRazorpay(): Promise<RazorpayCtor | null> {
  return new Promise((resolve) => {
    const w = window as unknown as { Razorpay?: RazorpayCtor }
    if (w.Razorpay) return resolve(w.Razorpay)
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${RAZORPAY_SRC}"]`)
    const script = existing ?? Object.assign(document.createElement("script"), { src: RAZORPAY_SRC, async: true })
    script.addEventListener("load", () => resolve(w.Razorpay ?? null), { once: true })
    script.addEventListener("error", () => resolve(null), { once: true })
    if (!existing) document.body.appendChild(script)
  })
}

function RazorpayCheckout({
  flow,
  onDone,
  onError,
}: {
  flow: Extract<CheckoutFlow, { kind: "RAZORPAY" }>
  onDone: (n: string) => void
  onError: (m: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const opened = useRef(false)

  const open = useCallback(async () => {
    setBusy(true)
    const Razorpay = await loadRazorpay()
    setBusy(false)
    if (!Razorpay) return onError("Couldn't load Razorpay Checkout. Check your connection and try again.")
    new Razorpay({
      key: flow.keyId,
      order_id: flow.orderId,
      amount: flow.amount,
      currency: flow.currency,
      name: "hustl.",
      description: "Escrow funding",
      handler: () => onDone("Payment submitted — waiting for Razorpay to confirm…"),
      modal: { ondismiss: () => onError("Payment was cancelled before it completed.") },
    }).open()
  }, [flow, onDone, onError])

  useEffect(() => {
    if (opened.current) return
    opened.current = true
    void open()
  }, [open])

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Razorpay Checkout opens in a secure overlay. If it didn't appear, reopen it below.</p>
      <DialogFooter>
        <Button variant="outline" disabled={busy} onClick={() => void open()}>
          {busy && <Loader2 className="size-4 animate-spin" />} Open Razorpay Checkout
        </Button>
      </DialogFooter>
    </div>
  )
}
