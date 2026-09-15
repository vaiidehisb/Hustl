"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Check, Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar } from "@/components/app/ui"
import { setPlanAction, updateBrandProfileAction, verifyKycAction, type BrandProfileInput } from "@/app/actions/brand"
import { cn } from "@/lib/utils"

const SIZES = ["1–10", "11–50", "51–200", "201–1000", "1000+"]

export function BrandProfileForm({ initial }: { initial: BrandProfileInput }) {
  const router = useRouter()
  const [f, setF] = useState(initial)
  const [pending, start] = useTransition()
  const dirty = JSON.stringify(f) !== JSON.stringify(initial)
  const set = (k: keyof BrandProfileInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }))

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const res = await updateBrandProfileAction(f)
          if (!res.ok) return void toast.error(res.error)
          toast.success("Company profile saved")
          router.refresh()
        })
      }}
    >
      <div className="flex items-center gap-4">
        <Avatar name={f.companyName || "Brand"} src={f.logoUrl || null} size={56} className="rounded-xl" />
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="s-logo">Logo URL</Label>
          <Input id="s-logo" type="url" value={f.logoUrl} onChange={set("logoUrl")} placeholder="https://…/logo.png" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="s-name">Company name</Label>
          <Input id="s-name" value={f.companyName} onChange={set("companyName")} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-web">Website</Label>
          <Input id="s-web" type="url" value={f.website} onChange={set("website")} placeholder="https://" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-ind">Industry</Label>
          <Input id="s-ind" value={f.industry} onChange={set("industry")} placeholder="e.g. D2C skincare" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-loc">Location</Label>
          <Input id="s-loc" value={f.location} onChange={set("location")} placeholder="e.g. Bengaluru" />
        </div>
        <div className="space-y-1.5">
          <Label>Company size</Label>
          <Select value={f.size || "unset"} onValueChange={(v) => setF((s) => ({ ...s, size: v === "unset" ? "" : v }))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unset">Not specified</SelectItem>
              {SIZES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s} employees
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="s-desc">About</Label>
        <Textarea id="s-desc" rows={4} value={f.description} onChange={set("description")} maxLength={1000} placeholder="What you make, who it's for, and what creators can expect working with you." />
        <p className="text-right text-xs text-muted-foreground tabular-nums">{f.description.length}/1000</p>
      </div>
      <div className="flex justify-end gap-2">
        {dirty && (
          <Button type="button" variant="ghost" onClick={() => setF(initial)} disabled={pending}>
            Discard
          </Button>
        )}
        <Button type="submit" disabled={pending || !dirty}>
          {pending && <Loader2 className="animate-spin" />} Save profile
        </Button>
      </div>
    </form>
  )
}

const PLANS = [
  { id: "STARTER" as const, name: "Starter", fee: "8%", blurb: "Pay as you go. No monthly commitment.", perks: ["Unlimited briefs", "AI matching & brief parser", "Escrow protection"] },
  { id: "GROWTH" as const, name: "Growth", fee: "5%", blurb: "For brands running campaigns every month.", perks: ["Everything in Starter", "Lower platform fee", "Priority dispute handling"] },
]

export function PlanPicker({ plan }: { plan: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [target, setTarget] = useState<string | null>(null)
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {PLANS.map((p) => {
        const current = plan === p.id || (p.id === "GROWTH" && plan === "ENTERPRISE")
        return (
          <div key={p.id} className={cn("flex flex-col rounded-lg border p-4", current && "border-primary ring-1 ring-primary")}>
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">{p.name}</span>
              <span className="text-sm">
                <span className="font-display text-xl font-bold">{p.fee}</span> <span className="text-muted-foreground">brand fee</span>
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{p.blurb}</p>
            <ul className="mt-3 space-y-1 text-xs">
              {p.perks.map((x) => (
                <li key={x} className="flex items-center gap-1.5">
                  <Check className="size-3 text-success" /> {x}
                </li>
              ))}
            </ul>
            <div className="mt-4">
              {current ? (
                <span className="inline-flex h-8 items-center text-sm font-medium text-primary">Current plan</span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    setTarget(p.id)
                    start(async () => {
                      const res = await setPlanAction(p.id)
                      setTarget(null)
                      if (!res.ok) return void toast.error(res.error)
                      toast.success(`Switched to ${p.name}`, { description: "New offers use the updated fee. Existing deals keep their rate." })
                      router.refresh()
                    })
                  }}
                >
                  {pending && target === p.id && <Loader2 className="animate-spin" />}
                  Switch to {p.name}
                </Button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function VerifyKycButton() {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Button
      onClick={() =>
        start(async () => {
          const res = await verifyKycAction()
          if (!res.ok) return void toast.error(res.error)
          toast.success("Business verified", { description: "Upfront payments are now available for eligible creators." })
          router.refresh()
        })
      }
      disabled={pending}
    >
      {pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Verify business (test mode)
    </Button>
  )
}
