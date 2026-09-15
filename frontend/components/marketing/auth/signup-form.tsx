"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { toast } from "sonner"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { registerAction } from "@/app/actions/auth"
import { GoogleButton, OrDivider } from "@/components/marketing/auth/google-button"
import { RolePicker, type Role } from "@/components/marketing/auth/role-picker"
import { portalPath } from "@/components/marketing/portal"

export function SignUpForm({ googleEnabled, initialRole }: { googleEnabled: boolean; initialRole: Role | null }) {
  const router = useRouter()
  const [role, setRole] = useState<Role | null>(initialRole)
  const [form, setForm] = useState({ name: "", email: "", password: "", companyName: "", handle: "" })
  const [show, setShow] = useState(false)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!role) {
      setError("Choose whether you’re joining as a brand or a creator.")
      return
    }
    setError("")
    startTransition(async () => {
      const res = await registerAction({
        role,
        name: form.name,
        email: form.email,
        password: form.password,
        companyName: role === "BRAND" ? form.companyName : undefined,
        handle: role === "CREATOR" ? form.handle : undefined,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      const login = await signIn("credentials", { email: form.email.trim().toLowerCase(), password: form.password, redirect: false })
      if (!login || login.error) {
        toast.success("Account created — please log in.")
        router.push("/auth/signin")
        return
      }
      toast.success("Welcome to hustl.!")
      router.push(portalPath(role))
      router.refresh()
    })
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-tight">Create your account</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Already on hustl.?{" "}
        <Link href="/auth/signin" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        <RolePicker value={role} onChange={setRole} />

        {googleEnabled && (
          <>
            <GoogleButton callbackUrl="/onboarding" label="Sign up with Google" />
            <OrDivider />
          </>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" autoComplete="name" required value={form.name} onChange={set("name")} className="h-11" />
          </div>

          {role === "BRAND" && (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="companyName">Company or brand name</Label>
              <Input id="companyName" autoComplete="organization" required value={form.companyName} onChange={set("companyName")} className="h-11" placeholder="Glow Lab" />
            </div>
          )}
          {role === "CREATOR" && (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="handle">Creator handle</Label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-muted-foreground">@</span>
                <Input
                  id="handle"
                  required
                  value={form.handle}
                  onChange={(e) => setForm((f) => ({ ...f, handle: e.target.value.replace(/^@/, "").toLowerCase() }))}
                  className="h-11 pl-7"
                  placeholder="ananya.creates"
                  pattern="[a-z0-9._]{3,30}"
                  title="3–30 characters: lowercase letters, numbers, dots or underscores"
                />
              </div>
              <p className="text-xs text-muted-foreground">Your public profile will live at hustl.app/creators/{form.handle || "handle"}</p>
            </div>
          )}

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="email">Work email</Label>
            <Input id="email" type="email" autoComplete="email" required value={form.email} onChange={set("email")} className="h-11" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                value={form.password}
                onChange={set("password")}
                className="h-11 pr-10"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground"
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" className="h-11 w-full" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {pending ? "Creating account…" : role === "BRAND" ? "Create brand account" : role === "CREATOR" ? "Create creator account" : "Create account"}
        </Button>
      </form>
    </div>
  )
}
