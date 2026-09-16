"use client"

// One place that knows how to start a subscription and where to send the
// subscriber next: the provider's hosted page in production, or the test
// provider's confirm path in development.

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { SubscribeResponse, SubscriptionProductKey } from "@hustl/contracts"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { confirmTestSubscriptionAction, subscribeAction } from "@/app/actions/billing"
import { inr } from "@/lib/format"

type Checkout = SubscribeResponse["checkout"]

/** Where a started subscription should continue, given what the provider returned. */
export function nextStep(checkout: Checkout): { kind: "test"; subscriptionId: string } | { kind: "hosted"; url: string } | { kind: "unavailable" } {
  if (!checkout) return { kind: "unavailable" }
  if (checkout.provider === "TEST") return { kind: "test", subscriptionId: checkout.subscriptionId }
  const hosted = checkout.provider === "RAZORPAY" ? checkout.shortUrl : ("hostedUrl" in checkout ? checkout.hostedUrl : null)
  return hosted ? { kind: "hosted", url: hosted } : { kind: "unavailable" }
}

export function SubscribeButton({
  product,
  price,
  interval,
  label,
  variant = "default",
  className,
}: {
  product: SubscriptionProductKey
  price: number | null
  interval: "MONTH" | "YEAR"
  label?: string
  variant?: "default" | "outline"
  className?: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [testConfirm, setTestConfirm] = useState<string | null>(null)

  const per = interval === "MONTH" ? "/month" : "/year"
  const cta = label ?? (price === null ? "Talk to sales" : `Subscribe · ${inr(price)}${per}`)

  const begin = () =>
    start(async () => {
      const res = await subscribeAction(product)
      if (!res.ok) {
        toast.error(res.error.message)
        return
      }
      if (res.data.alreadyActive) {
        toast.info("You're already subscribed to this.")
        router.refresh()
        return
      }
      const step = nextStep(res.data.checkout)
      if (step.kind === "test") setTestConfirm(step.subscriptionId)
      else if (step.kind === "hosted") {
        window.open(step.url, "_blank", "noopener")
        toast.info("Finish the payment in the tab we opened — the plan activates as soon as the provider confirms it.")
      } else toast.error("Payments aren't configured yet, so this can't be charged. Add the provider keys to enable it.")
    })

  const confirmTest = () =>
    start(async () => {
      if (!testConfirm) return
      const res = await confirmTestSubscriptionAction(testConfirm)
      if (!res.ok) {
        toast.error(res.error.message)
        return
      }
      setTestConfirm(null)
      toast.success("Subscription active.")
      router.refresh()
    })

  return (
    <>
      <Button variant={variant} className={className} disabled={pending} onClick={begin}>
        {pending && <Loader2 className="size-4 animate-spin" />} {cta}
      </Button>

      <Dialog open={!!testConfirm} onOpenChange={(open) => !open && setTestConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm in test mode</DialogTitle>
            <DialogDescription>
              No payment provider is configured, so this runs the same activation path a real provider webhook would. No money moves and no card details are collected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTestConfirm(null)}>
              Cancel
            </Button>
            <Button disabled={pending} onClick={confirmTest}>
              {pending && <Loader2 className="size-4 animate-spin" />} Activate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
