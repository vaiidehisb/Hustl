"use client"

import { useEffect, useState, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Loader2, Search, SlidersHorizontal, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cap, NICHES, PLATFORM_LABEL, PLATFORMS } from "./helpers"

export type DiscoverParams = {
  q?: string
  niche?: string
  platform?: string
  size?: string
  er?: string
  loc?: string
  verified?: string
  available?: string
  saved?: string
  sort?: string
  brief?: string
}

export const FOLLOWER_RANGES: { value: string; label: string; min: number; max: number }[] = [
  { value: "nano", label: "Nano · under 10K", min: 0, max: 10_000 },
  { value: "micro", label: "Micro · 10K–100K", min: 10_000, max: 100_000 },
  { value: "mid", label: "Mid · 100K–500K", min: 100_000, max: 500_000 },
  { value: "macro", label: "Macro · 500K–1M", min: 500_000, max: 1_000_000 },
  { value: "mega", label: "Mega · 1M+", min: 1_000_000, max: Infinity },
]

const ANY = "any"
const FILTER_KEYS: (keyof DiscoverParams)[] = ["niche", "platform", "size", "er", "loc", "verified", "available", "saved"]

function useParamNav(params: DiscoverParams) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, start] = useTransition()
  const set = (patch: Partial<DiscoverParams>) => {
    const next: Record<string, string> = {}
    for (const [k, v] of Object.entries({ ...params, ...patch })) if (v && v !== ANY) next[k] = v
    const qs = new URLSearchParams(next).toString()
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }
  return { set, pending }
}

export function DiscoverToolbar({ params, briefs }: { params: DiscoverParams; briefs: { id: string; title: string }[] }) {
  const { set, pending } = useParamNav(params)
  const [q, setQ] = useState(params.q ?? "")
  const active = FILTER_KEYS.filter((k) => params[k]).length

  useEffect(() => setQ(params.q ?? ""), [params.q])
  useEffect(() => {
    if ((params.q ?? "") === q) return
    const t = setTimeout(() => set({ q }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, @handle, headline or bio" className="h-10 pl-9" aria-label="Search creators" />
          {pending && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="h-10 lg:hidden">
                <SlidersHorizontal /> Filters
                {active > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">{active}</span>}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[320px] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-6">
                <FilterFields params={params} />
              </div>
            </SheetContent>
          </Sheet>
          <Select value={params.sort ?? "relevance"} onValueChange={(v) => set({ sort: v === "relevance" ? undefined : v })}>
            <SelectTrigger className="h-10 w-full sm:w-[170px]" aria-label="Sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="relevance">Best match</SelectItem>
              <SelectItem value="followers">Most followers</SelectItem>
              <SelectItem value="engagement">Highest engagement</SelectItem>
              <SelectItem value="trust">Most trusted</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border bg-card px-3 py-2.5 sm:flex-row sm:items-center">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="size-4 text-primary" /> Match to brief
        </span>
        {briefs.length === 0 ? (
          <span className="text-sm text-muted-foreground">Publish a brief to rank creators by AI fit.</span>
        ) : (
          <Select value={params.brief ?? ANY} onValueChange={(v) => set({ brief: v })}>
            <SelectTrigger className="h-8 w-full sm:w-[320px]" aria-label="Match to brief">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>No brief — browse all</SelectItem>
              {briefs.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  )
}

export function FilterFields({ params }: { params: DiscoverParams }) {
  const { set } = useParamNav(params)
  const [loc, setLoc] = useState(params.loc ?? "")
  useEffect(() => setLoc(params.loc ?? ""), [params.loc])
  const active = FILTER_KEYS.filter((k) => params[k]).length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Filters</span>
        {active > 0 && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={() => set(Object.fromEntries(FILTER_KEYS.map((k) => [k, undefined])))}
          >
            <X className="size-3" /> Clear {active}
          </button>
        )}
      </div>

      <Field label="Niche">
        <Select value={params.niche ?? ANY} onValueChange={(v) => set({ niche: v })}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any niche</SelectItem>
            {NICHES.map((n) => (
              <SelectItem key={n} value={n}>
                {cap(n)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Platform">
        <Select value={params.platform ?? ANY} onValueChange={(v) => set({ platform: v })}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any platform</SelectItem>
            {PLATFORMS.map((p) => (
              <SelectItem key={p} value={p}>
                {PLATFORM_LABEL[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Followers">
        <Select value={params.size ?? ANY} onValueChange={(v) => set({ size: v })}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any size</SelectItem>
            {FOLLOWER_RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Min. engagement rate">
        <Select value={params.er ?? ANY} onValueChange={(v) => set({ er: v })}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any</SelectItem>
            {["1", "2", "3", "5", "8"].map((v) => (
              <SelectItem key={v} value={v}>
                {v}%+
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Location">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            set({ loc: loc.trim() || undefined })
          }}
        >
          <Input value={loc} onChange={(e) => setLoc(e.target.value)} onBlur={() => (loc.trim() || undefined) !== params.loc && set({ loc: loc.trim() || undefined })} placeholder="e.g. Mumbai" />
        </form>
      </Field>

      <div className="space-y-3 border-t pt-4">
        <Toggle id="f-verified" label="Verified only" checked={params.verified === "1"} onChange={(c) => set({ verified: c ? "1" : undefined })} />
        <Toggle id="f-available" label="Available now" checked={params.available === "1"} onChange={(c) => set({ available: c ? "1" : undefined })} />
        <Toggle id="f-saved" label="Saved creators" checked={params.saved === "1"} onChange={(c) => set({ saved: c ? "1" : undefined })} />
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function Toggle({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (c: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
