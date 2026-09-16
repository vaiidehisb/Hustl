"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm, type FieldPath } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { signIn } from "next-auth/react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { registerAction } from "@/app/actions/auth"
import { GoogleButton, OrDivider } from "@/components/marketing/auth/google-button"
import { FieldError, FormAlert, PasswordField, TextField } from "@/components/marketing/auth/field"
import { RolePicker, type Role } from "@/components/marketing/auth/role-picker"
import { portalPath } from "@/components/marketing/portal"
import { PASSWORD_HINT, signInErrorMessage, signUpSchema, toRegisterRequest, type SignUpValues } from "@/lib/validation/auth"

const FIELDS = new Set<string>(["role", "name", "email", "password", "companyName", "handle"])

export function SignUpForm({ googleEnabled, initialRole }: { googleEnabled: boolean; initialRole: Role | null }) {
  const router = useRouter()
  const [formError, setFormError] = useState("")
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { role: initialRole ?? undefined, name: "", email: "", password: "", companyName: "", handle: "" },
  })
  const role = watch("role")
  const handleValue = watch("handle")

  const onSubmit = handleSubmit(async (values) => {
    setFormError("")
    const res = await registerAction(toRegisterRequest(values))
    if (!res.ok) {
      const entries = Object.entries(res.fieldErrors ?? {})
      const known = entries.filter(([k]) => FIELDS.has(k))
      known.forEach(([k, message]) => setError(k as FieldPath<SignUpValues>, { type: "server", message }))
      // Field-level errors (409 duplicate email, 422) show inline; everything else in the banner.
      if (known.length === 0 || known.length < entries.length) setFormError(res.error)
      return
    }

    const login = await signIn("credentials", { email: values.email, password: values.password, redirect: false })
    if (!login?.ok || login.error) {
      toast.success("Account created. Please log in.")
      if (login?.error) toast.error(signInErrorMessage(login.error))
      router.push("/auth/signin")
      return
    }
    toast.success("Welcome to hustl.!")
    router.replace(portalPath(res.data.role))
    router.refresh()
  })

  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-tight">Create your account</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Already on hustl.?{" "}
        <Link href="/auth/signin" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
        <div className="space-y-2">
          <RolePicker value={role ?? null} onChange={(r) => setValue("role", r, { shouldValidate: true })} />
          <FieldError id="role-error" message={errors.role?.message} />
        </div>

        {googleEnabled && (
          <>
            <GoogleButton callbackUrl="/onboarding" label="Sign up with Google" />
            <OrDivider />
          </>
        )}

        <div className="space-y-4">
          <TextField label="Full name" autoComplete="name" error={errors.name?.message} {...register("name")} />

          {role === "BRAND" && (
            <TextField label="Company or brand name" autoComplete="organization" placeholder="Your company" error={errors.companyName?.message} {...register("companyName")} />
          )}
          {role === "CREATOR" && (
            <TextField
              label="Creator handle"
              prefix="@"
              placeholder="yourhandle"
              error={errors.handle?.message}
              hint={`Optional. Your public profile will live at hustl.app/creators/${handleValue?.replace(/^@/, "").toLowerCase() || "handle"}`}
              {...register("handle", { setValueAs: (v: string) => v.replace(/^@/, "").toLowerCase() })}
            />
          )}

          <TextField label="Work email" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
          <PasswordField label="Password" autoComplete="new-password" error={errors.password?.message} hint={PASSWORD_HINT} {...register("password")} />
        </div>

        <FormAlert message={formError} />

        <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          {isSubmitting ? "Creating account…" : role === "BRAND" ? "Create brand account" : role === "CREATOR" ? "Create creator account" : "Create account"}
        </Button>
      </form>
    </div>
  )
}
