"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertTriangle, Banknote, CheckCircle2, ExternalLink, Loader2 } from "lucide-react"
import type { PayoutAccountDTO } from "@hustl/contracts"
import { Button } from "@/components/ui/button"
import { Panel, Pill } from "@/components/app/ui"
import { payoutOnboardingLinkAction } from "@/app/actions/creator"
import type { SerializedError } from "./lib"
import { ErrorState } from "./states"

const STATUS: Record<PayoutAccountDTO["status"], { tone: "neutral" | "warning" | "success" | "danger"; label: string; copy: string }> = {
  NOT_CONNECTED: { tone: "neutral", label: "Not connected", copy: "Connect a payout account so released milestones can reach your bank." },
  PENDING: { tone: "warning", label: "Pending", copy: "Your provider is still reviewing the details you submitted. Payouts stay on hold until it's active." },
  ACTIVE: { tone: "success", label: "Active", copy: "Released milestones are paid to this account, usually within T+1 to T+2 business days." },
  RESTRICTED: { tone: "danger", label: "Restricted", copy: "Your provider needs more information before it can pay out. Open onboarding to finish." },
}

export function PayoutAccountPanel({ account, error }: { account: PayoutAccountDTO | null; error?: SerializedError }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [unavailable, setUnavailable] = useState<string | null>(null)

  if (error) {
    return (
      <Panel title="Payout account">
        <ErrorState error={error} compact />
      </Panel>
    )
  }
  if (!account) return null

  const state = STATUS[account.status]

  const connect = () => {
    setUnavailable(null)
    startTransition(async () => {
      const res = await payoutOnboardingLinkAction(typeof window !== "undefined" ? `${window.location.origin}/creator/earnings` : undefined)
      if (!res.ok) {
        if (res.error.code === "INTEGRATION_UNAVAILABLE") setUnavailable(res.error.message)
        else toast.error(res.error.message)
        return
      }
      if (res.data.url) {
        window.open(res.data.url, "_blank", "noopener,noreferrer")
        toast.success("Onboarding opened in a new tab", { description: "Come back here when the provider is done." })
      } else {
        toast.success("Payout account updated")
      }
      router.refresh()
    })
  }

  return (
    <Panel title="Payout account" action={<Pill tone={state.tone}>{state.label}</Pill>}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          {account.status === "ACTIVE" ? <CheckCircle2 className="size-5 text-success" /> : <Banknote className="size-5" />}
        </span>
        <div className="min-w-0">
          <div className="font-medium">{account.provider ? `${account.provider[0]}${account.provider.slice(1).toLowerCase()} payouts` : "No provider connected"}</div>
          <p className="mt-1 text-sm text-muted-foreground">{state.copy}</p>
          {account.providerAccountId && <p className="mt-1 font-mono text-xs text-muted-foreground">{account.providerAccountId}</p>}
        </div>
      </div>

      {unavailable ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-xs font-medium text-warning">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          <span>
            {unavailable} Payouts stay recorded in your ledger meanwhile — nothing is lost, and you can connect the account as soon as the provider keys are configured on the server.
          </span>
        </div>
      ) : (
        <Button variant={account.status === "ACTIVE" ? "outline" : "default"} className="mt-4" onClick={connect} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
          {account.status === "NOT_CONNECTED" ? "Connect payout account" : account.status === "ACTIVE" ? "Manage with provider" : "Finish onboarding"}
        </Button>
      )}
    </Panel>
  )
}
