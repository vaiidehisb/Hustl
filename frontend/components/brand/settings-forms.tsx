"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { z } from "zod"
import { toast } from "sonner"
import { Check, Loader2, ShieldCheck } from "lucide-react"
import { BRAND_FEE_RATES, PROCESSING_FEE_RATE, type KycStatus, type OwnBrandProfile, type UpdateBrandProfileRequest, type VerificationRequestDto } from "@hustl/contracts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, Pill } from "@/components/app/ui"
import { requestVerificationAction, updateBrandProfileAction, type ActionResult } from "@/app/actions/brand"
import { cn } from "@/lib/utils"

const SIZES = ["1–10", "11–50", "51–200", "201–1000", "1000+"]

function reportError(res: Extract<ActionResult<unknown>, { ok: false }>) {
  toast.error(res.error.message, {
    description:
      res.error.code === "SERVICE_UNAVAILABLE" || res.error.code === "TIMEOUT"
        ? "The service didn't respond — nothing was saved."
        : res.error.code === "CONFLICT"
          ? "Reload the page and try again."
          : undefined,
  })
}

// ─── Company profile ─────────────────────────────────────────────────────────

const profileForm = z.object({
  companyName: z.string().trim().min(2, "Company name is required").max(120),
  website: z.string().trim().max(2048),
  industry: z.string().trim().max(80),
  description: z.string().trim().max(2000),
  location: z.string().trim().max(100),
  size: z.string().trim().max(40),
  logoUrl: z.string().trim().max(2048),
  gstin: z.string().trim().max(20),
})
type ProfileValues = z.infer<typeof profileForm>

export function BrandProfileForm({ profile }: { profile: OwnBrandProfile }) {
  const router = useRouter()
  const defaults: ProfileValues = {
    companyName: profile.companyName,
    website: profile.website ?? "",
    industry: profile.industry ?? "",
    description: profile.description ?? "",
    location: profile.location ?? "",
    size: profile.size ?? "",
    logoUrl: profile.logoUrl ?? "",
    gstin: profile.gstin ?? "",
  }
  const { register, handleSubmit, reset, setError, setValue, watch, formState } = useForm<ProfileValues>({ resolver: zodResolver(profileForm), defaultValues: defaults })
  const values = watch()

  const onSubmit = handleSubmit(async (v) => {
    const body: UpdateBrandProfileRequest = {
      companyName: v.companyName,
      website: v.website,
      industry: v.industry,
      description: v.description,
      location: v.location,
      size: v.size,
      logoUrl: v.logoUrl ? v.logoUrl : null,
      gstin: v.gstin ? v.gstin.toUpperCase() : null,
    }
    const res = await updateBrandProfileAction(body)
    if (!res.ok) {
      for (const [field, message] of Object.entries(res.error.fieldErrors ?? {})) {
        if (field in v) setError(field as keyof ProfileValues, { message })
      }
      reportError(res)
      return
    }
    toast.success("Company profile saved")
    reset({ ...v, gstin: res.data.gstin ?? "", logoUrl: res.data.logoUrl ?? "" })
    router.refresh()
  })

  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <div className="flex items-center gap-4">
        <Avatar name={values.companyName || "Brand"} src={values.logoUrl || null} size={56} className="rounded-xl" />
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="s-logo">Logo URL</Label>
          <Input id="s-logo" type="url" placeholder="https://…/logo.png" {...register("logoUrl")} />
          <FieldError message={formState.errors.logoUrl?.message} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="s-name">Company name</Label>
          <Input id="s-name" required {...register("companyName")} aria-invalid={!!formState.errors.companyName} />
          <FieldError message={formState.errors.companyName?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-web">Website</Label>
          <Input id="s-web" type="url" placeholder="https://" {...register("website")} />
          <FieldError message={formState.errors.website?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-ind">Industry</Label>
          <Input id="s-ind" placeholder="e.g. D2C skincare" {...register("industry")} />
          <FieldError message={formState.errors.industry?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-loc">Location</Label>
          <Input id="s-loc" placeholder="e.g. Bengaluru" {...register("location")} />
          <FieldError message={formState.errors.location?.message} />
        </div>
        <div className="space-y-1.5">
          <Label>Company size</Label>
          <Select value={values.size || "unset"} onValueChange={(v) => setValue("size", v === "unset" ? "" : v, { shouldDirty: true })}>
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
        <div className="space-y-1.5">
          <Label htmlFor="s-gstin">GSTIN</Label>
          <Input id="s-gstin" placeholder="22AAAAA0000A1Z5" className="uppercase" {...register("gstin")} aria-invalid={!!formState.errors.gstin} />
          <FieldError message={formState.errors.gstin?.message} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="s-desc">About</Label>
        <Textarea id="s-desc" rows={4} maxLength={2000} placeholder="What you make, who it's for, and what creators can expect working with you." {...register("description")} />
        <p className="text-right text-xs tabular-nums text-muted-foreground">{values.description.length}/2000</p>
      </div>
      <div className="flex justify-end gap-2">
        {formState.isDirty && (
          <Button type="button" variant="ghost" onClick={() => reset(defaults)} disabled={formState.isSubmitting}>
            Discard
          </Button>
        )}
        <Button type="submit" disabled={formState.isSubmitting || !formState.isDirty}>
          {formState.isSubmitting && <Loader2 className="animate-spin" />} Save profile
        </Button>
      </div>
    </form>
  )
}

// ─── Verification ────────────────────────────────────────────────────────────

const verificationForm = z.object({
  legalName: z.string().trim().min(2, "Enter the registered legal name").max(200),
  gstin: z.string().trim().max(20).optional(),
  website: z.string().trim().max(200).optional(),
  contactPhone: z.string().trim().max(20).optional(),
})
type VerificationValues = z.infer<typeof verificationForm>

export function VerificationRequestForm({ kycStatus, latest, defaults }: { kycStatus: KycStatus; latest: VerificationRequestDto | null; defaults: { legalName: string; gstin: string; website: string } }) {
  const router = useRouter()
  const { register, handleSubmit, setError, formState } = useForm<VerificationValues>({
    resolver: zodResolver(verificationForm),
    defaultValues: { legalName: defaults.legalName, gstin: defaults.gstin, website: defaults.website, contactPhone: "" },
  })

  if (kycStatus === "VERIFIED") return null

  if (latest?.status === "PENDING" || kycStatus === "PENDING") {
    return (
      <div className="space-y-2 text-sm">
        <Pill tone="warning">Under review</Pill>
        <p className="text-muted-foreground">
          Your verification request is with our team. We'll email you once it's reviewed — usually within two working days.
        </p>
      </div>
    )
  }

  const onSubmit = handleSubmit(async (v) => {
    const res = await requestVerificationAction({ legalName: v.legalName, gstin: v.gstin ?? "", website: v.website ?? "", contactPhone: v.contactPhone ?? "" })
    if (!res.ok) {
      for (const [field, message] of Object.entries(res.error.fieldErrors ?? {})) if (field in v) setError(field as keyof VerificationValues, { message })
      reportError(res)
      return
    }
    toast.success("Verification requested", { description: "An admin reviews business documents before your badge appears." })
    router.refresh()
  })

  return (
    <form className="space-y-3 text-sm" onSubmit={onSubmit}>
      {latest?.status === "REJECTED" && (
        <p className="rounded-lg border border-destructive/30 bg-danger-soft px-3 py-2 text-xs text-destructive">
          Your last request was rejected{latest.reviewerNote ? `: ${latest.reviewerNote}` : "."} You can submit a corrected request.
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="v-name">Registered legal name</Label>
        <Input id="v-name" required {...register("legalName")} aria-invalid={!!formState.errors.legalName} />
        <FieldError message={formState.errors.legalName?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="v-gstin">GSTIN or business PAN</Label>
        <Input id="v-gstin" className="uppercase" {...register("gstin")} />
        <FieldError message={formState.errors.gstin?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="v-phone">Contact phone</Label>
        <Input id="v-phone" inputMode="tel" {...register("contactPhone")} />
      </div>
      <Button type="submit" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Request verification
      </Button>
      <p className="text-xs text-muted-foreground">A hustl. reviewer checks your details — verification is never instant.</p>
    </form>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs font-medium text-destructive">{message}</p>
}

// ─── Plan ────────────────────────────────────────────────────────────────────

const PLANS = [
  { id: "STARTER" as const, name: "Starter", blurb: "Pay as you go. No monthly commitment.", perks: ["Unlimited briefs", "AI matching & brief parser", "Escrow protection"] },
  { id: "GROWTH" as const, name: "Growth", blurb: "For brands running campaigns every month.", perks: ["Everything in Starter", "Lower platform fee", "Priority dispute handling"] },
  { id: "ENTERPRISE" as const, name: "Enterprise", blurb: "Custom terms, managed onboarding.", perks: ["Everything in Growth", "Dedicated support", "Invoiced billing"] },
]

export function PlanCards({ plan }: { plan: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {PLANS.map((p) => {
        const current = plan === p.id
        const rate = BRAND_FEE_RATES[p.id]
        return (
          <div key={p.id} className={cn("flex flex-col rounded-lg border p-4", current && "border-primary ring-1 ring-primary")}>
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">{p.name}</span>
              <span className="text-sm">
                <span className="font-display text-xl font-bold">{Math.round(rate * 100)}%</span> <span className="text-muted-foreground">brand fee</span>
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
            <div className="mt-4 text-sm">
              {current ? <span className="font-medium text-primary">Current plan</span> : <span className="text-muted-foreground">Contact sales to switch</span>}
            </div>
          </div>
        )
      })}
      <p className="text-xs text-muted-foreground sm:col-span-3">
        Plus {Math.round(PROCESSING_FEE_RATE * 100)}% payment processing at funding. Fees are snapshotted on each deal, so existing deals keep their rate.
      </p>
    </div>
  )
}
