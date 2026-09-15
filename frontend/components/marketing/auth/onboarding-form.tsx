"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm, type FieldPath } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { completeOnboardingAction } from "@/app/actions/auth"
import { FieldError, FormAlert, TextField } from "@/components/marketing/auth/field"
import { RolePicker } from "@/components/marketing/auth/role-picker"
import { portalPath } from "@/components/marketing/portal"
import { onboardingSchema, toChooseRoleRequest, type OnboardingValues } from "@/lib/validation/auth"

const FIELDS = new Set<string>(["role", "companyName", "handle"])

export function OnboardingForm({ name }: { name: string }) {
  const router = useRouter()
  const { update } = useSession()
  const [formError, setFormError] = useState("")
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingValues>({ resolver: zodResolver(onboardingSchema), defaultValues: { companyName: "", handle: "" } })
  const role = watch("role")

  const onSubmit = handleSubmit(async (values) => {
    setFormError("")
    const res = await completeOnboardingAction(toChooseRoleRequest(values))
    if (!res.ok) {
      const entries = Object.entries(res.fieldErrors ?? {})
      const known = entries.filter(([k]) => FIELDS.has(k))
      known.forEach(([k, message]) => setError(k as FieldPath<OnboardingValues>, { type: "server", message }))
      if (known.length === 0 || known.length < entries.length) setFormError(res.error)
      if (res.code === "UNAUTHORIZED") router.push("/auth/signin?expired=1&callbackUrl=/onboarding")
      return
    }
    // The action rewrote the session cookie; sync useSession() and middleware sees the role.
    await update()
    toast.success("You're all set.")
    router.replace(portalPath(res.data.role))
    router.refresh()
  })

  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-tight">Welcome{name ? `, ${name.split(" ")[0]}` : ""}</h1>
      <p className="mt-2 text-sm text-muted-foreground">One last step: tell us how you&apos;ll use hustl.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
        <div className="space-y-2">
          <RolePicker value={role ?? null} onChange={(r) => setValue("role", r, { shouldValidate: true })} />
          <FieldError id="role-error" message={errors.role?.message} />
        </div>

        {role === "BRAND" && <TextField label="Company or brand name" placeholder="Your company" error={errors.companyName?.message} {...register("companyName")} />}
        {role === "CREATOR" && (
          <TextField
            label="Creator handle"
            prefix="@"
            placeholder="yourhandle"
            hint="Optional: we'll suggest one from your name if you leave it blank."
            error={errors.handle?.message}
            {...register("handle", { setValueAs: (v: string) => v.replace(/^@/, "").toLowerCase() })}
          />
        )}

        <FormAlert message={formError} />

        <Button type="submit" className="h-11 w-full" disabled={isSubmitting || !role}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          {isSubmitting ? "Setting up…" : "Continue"}
        </Button>
      </form>
    </div>
  )
}
