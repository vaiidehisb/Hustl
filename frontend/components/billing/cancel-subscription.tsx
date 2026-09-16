"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { cancelSubscriptionAction } from "@/app/actions/billing"
import { shortDate } from "@/lib/format"

export function CancelSubscription({ subscriptionId, keeps, until }: { subscriptionId: string; keeps: string; until: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Cancel
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this subscription?</DialogTitle>
          <DialogDescription>
            You keep {keeps} until {shortDate(until)}, the end of the period you've paid for. Nothing renews after that, and you can subscribe again any time.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Keep it
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await cancelSubscriptionAction(subscriptionId)
                if (!res.ok) {
                  toast.error(res.error.message)
                  return
                }
                setOpen(false)
                toast.success(`Cancelled. Access continues until ${shortDate(res.data.accessUntil)}.`)
                router.refresh()
              })
            }
          >
            {pending && <Loader2 className="size-4 animate-spin" />} Cancel subscription
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
