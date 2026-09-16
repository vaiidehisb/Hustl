"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { getSession, signIn } from "next-auth/react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { GoogleButton, OrDivider } from "@/components/marketing/auth/google-button"
import { FormAlert, PasswordField, TextField } from "@/components/marketing/auth/field"
import { portalPath } from "@/components/marketing/portal"
import { signInErrorMessage, signInSchema, type SignInValues } from "@/lib/validation/auth"

/** Only follow same-origin callback URLs (middleware passes absolute ones). */
function safeCallback(cb: string | undefined) {
  if (!cb || typeof window === "undefined") return null
  try {
    const url = new URL(cb, window.location.origin)
    if (url.origin !== window.location.origin) return null
    const path = url.pathname + url.search
    return path === "/" || path.startsWith("/auth") ? null : path
  } catch {
    return null
  }
}

export function SignInForm({
  googleEnabled,
  callbackUrl,
  initialError,
  expired,
}: {
  googleEnabled: boolean
  callbackUrl?: string
  initialError?: string
  expired?: boolean
}) {
  const router = useRouter()
  const [formError, setFormError] = useState(initialError ? signInErrorMessage(initialError) : "")
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({ resolver: zodResolver(signInSchema), defaultValues: { email: "", password: "" } })

  const onSubmit = handleSubmit(async (values) => {
    setFormError("")
    try {
      const res = await signIn("credentials", { email: values.email, password: values.password, redirect: false })
      if (!res?.ok || res.error) {
        setFormError(signInErrorMessage(res?.error))
        return
      }
      const session = await getSession()
      router.replace(safeCallback(callbackUrl) ?? portalPath(session?.user?.role))
      router.refresh()
    } catch {
      setFormError(signInErrorMessage("SERVICE_UNAVAILABLE"))
    }
  })

  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        New to hustl.?{" "}
        <Link href="/auth/signup" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>

      {expired && !formError && (
        <p role="status" className="mt-6 rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
          Your session expired. Please log in again.
        </p>
      )}

      <div className="mt-8">
        {googleEnabled && (
          <>
            <GoogleButton callbackUrl="/dashboard" />
            <OrDivider />
          </>
        )}

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <TextField label="Email" type="email" autoComplete="email" placeholder="you@company.com" error={errors.email?.message} {...register("email")} />
          <PasswordField
            label="Password"
            autoComplete="current-password"
            error={errors.password?.message}
            labelAside={
              <Link href="/auth/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">
                Forgot password?
              </Link>
            }
            {...register("password")}
          />

          <FormAlert message={formError} />

          <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />}
            {isSubmitting ? "Signing in…" : "Log in"}
          </Button>
        </form>
      </div>
    </div>
  )
}
