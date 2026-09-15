"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { Building2, Eye, EyeOff, Loader2, Shield, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { GoogleButton, OrDivider } from "@/components/marketing/auth/google-button"
import { portalPath } from "@/components/marketing/portal"

const DEMO_PASSWORD = "hustl1234"
const DEMOS = [
  { email: "brand@hustl.demo", label: "Brand", icon: Building2 },
  { email: "creator@hustl.demo", label: "Creator", icon: UserRound },
  { email: "admin@hustl.demo", label: "Admin", icon: Shield },
]

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

export function SignInForm({ googleEnabled, callbackUrl, initialError }: { googleEnabled: boolean; callbackUrl?: string; initialError?: string }) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(initialError ? "Sign-in failed. Please try again." : "")

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const res = await signIn("credentials", { email, password, redirect: false })
      if (!res || res.error) {
        setError("Incorrect email or password.")
        setLoading(false)
        return
      }
      const session = await fetch("/api/auth/session", { cache: "no-store" }).then((r) => r.json())
      const role: string | null = session?.user?.role ?? null
      router.push(safeCallback(callbackUrl) ?? portalPath(role))
      router.refresh()
    } catch {
      setError("Something went wrong. Please try again.")
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        New to hustl.?{" "}
        <Link href="/auth/signup" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>

      <div className="mt-8">
        {googleEnabled && (
          <>
            <GoogleButton callbackUrl="/dashboard" />
            <OrDivider />
          </>
        )}

        <form onSubmit={onSubmit} className="space-y-4" noValidate={false}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" placeholder="you@company.com" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link href="/auth/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="h-11 w-full" disabled={loading}>
            {loading && <Loader2 className="animate-spin" />}
            {loading ? "Signing in…" : "Log in"}
          </Button>
        </form>

        <div className="mt-8 rounded-xl border border-dashed bg-muted/40 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Try a demo account</span>
            <span className="font-mono text-xs text-muted-foreground">pw: {DEMO_PASSWORD}</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {DEMOS.map((d) => (
              <button
                key={d.email}
                type="button"
                onClick={() => {
                  setEmail(d.email)
                  setPassword(DEMO_PASSWORD)
                  setError("")
                }}
                className="flex flex-col items-center gap-1 rounded-lg border bg-card px-2 py-2.5 text-xs font-medium transition hover:border-primary/40 hover:bg-accent"
                title={d.email}
              >
                <d.icon className="size-4 text-primary" />
                {d.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Click to fill, then Log in. Available when the database is seeded.</p>
        </div>
      </div>
    </div>
  )
}
