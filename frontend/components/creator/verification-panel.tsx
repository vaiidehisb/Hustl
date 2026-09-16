"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { BadgeCheck, Loader2, ShieldCheck } from "lucide-react"
import type { VerificationRequestDto } from "@hustl/contracts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Panel, Pill } from "@/components/app/ui"
import { requestVerificationAction } from "@/app/actions/creator"
import { shortDate } from "@/lib/format"

const STATUS_TONE = { PENDING: "warning", APPROVED: "success", REJECTED: "danger" } as const

export function VerificationPanel({ verified, requests }: { verified: boolean; requests: VerificationRequestDto[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [legalName, setLegalName] = useState("")
  const [idType, setIdType] = useState("Aadhaar")
  const [idNumber, setIdNumber] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})

  const latest = requests.find((r) => r.type === "CREATOR_IDENTITY") ?? null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    startTransition(async () => {
      const res = await requestVerificationAction({
        type: "CREATOR_IDENTITY",
        details: { legalName: legalName.trim(), idType, idNumber: idNumber.trim() },
        documentIds: [],
      })
      if (!res.ok) {
        setErrors(res.error.fieldErrors ?? {})
        toast.error(res.error.message)
        return
      }
      toast.success("Verification requested", { description: "The hustl. team reviews identity checks manually." })
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Panel title="Verification" action={verified ? <Pill tone="success">Verified</Pill> : latest ? <Pill tone={STATUS_TONE[latest.status]}>{latest.status.toLowerCase()}</Pill> : undefined}>
      <div className="flex items-start gap-3">
        <ShieldCheck className={`mt-0.5 size-5 shrink-0 ${verified ? "text-success" : "text-muted-foreground"}`} />
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            {verified
              ? "You're verified. Brands see the badge on your profile and on every application."
              : latest?.status === "PENDING"
                ? `Submitted ${shortDate(latest.createdAt)} — a reviewer will decide shortly.`
                : latest?.status === "REJECTED"
                  ? latest.reviewerNote || "Your last request wasn't approved. You can submit again with corrected details."
                  : "Verified creators are filtered for by brands and clear escrow checks faster."}
          </p>
          {!verified && latest?.status !== "PENDING" && !open && (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setOpen(true)}>
              <BadgeCheck className="size-3.5" /> Request verification
            </Button>
          )}
        </div>
      </div>

      {open && !verified && (
        <form onSubmit={submit} className="mt-5 space-y-4 border-t pt-4">
          <div className="space-y-2">
            <Label htmlFor="v-name">Full legal name</Label>
            <Input id="v-name" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="As printed on your ID" aria-invalid={!!errors["details.legalName"]} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="v-type">ID type</Label>
              <Input id="v-type" value={idType} onChange={(e) => setIdType(e.target.value)} placeholder="Aadhaar, PAN, Passport" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="v-number">ID number</Label>
              <Input id="v-number" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="XXXX XXXX XXXX" aria-invalid={!!errors["details.idNumber"]} />
            </div>
          </div>
          {errors.details && <p className="text-xs font-medium text-destructive">{errors.details}</p>}
          <p className="text-xs text-muted-foreground">
            Document uploads aren&apos;t wired up yet — the media service has no identity-document kind, so a reviewer will ask for files over email if they need them.
          </p>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending || !legalName.trim() || !idNumber.trim()}>
              {pending && <Loader2 className="size-3.5 animate-spin" />}
              Submit request
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Panel>
  )
}
