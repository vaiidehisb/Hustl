"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { completeOnboardingAction } from "@/app/actions/auth"
import { RolePicker, type Role } from "@/components/marketing/auth/role-picker"
import { portalPath } from "@/components/marketing/portal"

export function OnboardingForm({ name }: { name: string }) {
  const router = useRouter()
  const { update } = useSession()
  const [role, setRole] = useState<Role | null>(null)
  const [companyName, setCompanyName] = useState("")
  const [handle, setHandle] = useState("")
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!role) return setError("Choose whether you’re joining as a brand or a creator.")
    setError("")
    startTransition(async () => {
      const res = await completeOnboardingAction({ role, companyName, handle })
      if (!res.ok) return setError(res.error)
      // Refresh the JWT so middleware sees the new role.
      await update()
      toast.success("You’re all set.")
      router.push(portalPath(res.data?.role ?? role))
      router.refresh()
    })
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-tight">Welcome{name ? `, ${name.split(" ")[0]}` : ""}</h1>
      <p className="mt-2 text-sm text-muted-foreground">One last step — tell us how you’ll use hustl.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        <RolePicker value={role} onChange={setRole} />

        {role === "BRAND" && (
          <div className="space-y-2">
            <Label htmlFor="companyName">Company or brand name</Label>
            <Input id="companyName" required value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="h-11" placeholder="Glow Lab" />
          </div>
        )}
        {role === "CREATOR" && (
          <div className="space-y-2">
            <Label htmlFor="handle">Creator handle</Label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-muted-foreground">@</span>
              <Input
                id="handle"
                required
                value={handle}
                onChange={(e) => setHandle(e.target.value.replace(/^@/, "").toLowerCase())}
                className="h-11 pl-7"
                placeholder="ananya.creates"
                pattern="[a-z0-9._]{3,30}"
                title="3–30 characters: lowercase letters, numbers, dots or underscores"
              />
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" className="h-11 w-full" disabled={pending || !role}>
          {pending && <Loader2 className="animate-spin" />}
          {pending ? "Setting up…" : "Continue"}
        </Button>
      </form>
    </div>
  )
}
