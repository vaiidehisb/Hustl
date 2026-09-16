"use client"

import { Building2, Check, UserRound } from "lucide-react"
import { cn } from "@/lib/utils"

export type Role = "BRAND" | "CREATOR"

const OPTIONS = [
  { value: "BRAND" as const, icon: Building2, title: "I’m a brand", body: "Hire creators, pay safely through escrow" },
  { value: "CREATOR" as const, icon: UserRound, title: "I’m a creator", body: "Find brand deals, get paid on every milestone" },
]

export function RolePicker({ value, onChange }: { value: Role | null; onChange: (r: Role) => void }) {
  return (
    <div role="radiogroup" aria-label="Account type" className="grid grid-cols-2 gap-3">
      {OPTIONS.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative flex flex-col items-start gap-3 rounded-2xl border bg-card p-4 text-left transition outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:p-5",
              active ? "border-primary ring-1 ring-primary shadow-md shadow-primary/10" : "hover:border-primary/40",
            )}
          >
            <span className={cn("grid size-10 place-items-center rounded-xl", active ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground")}>
              <o.icon className="size-5" />
            </span>
            <span>
              <span className="block font-semibold">{o.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{o.body}</span>
            </span>
            {active && (
              <span className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3" />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
