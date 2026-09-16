"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Loader2, Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { NICHES, SOCIAL_PLATFORMS, nicheLabel, platformLabel } from "./lib"

const BUDGETS = [
  { value: "5000", label: "₹5K+" },
  { value: "10000", label: "₹10K+" },
  { value: "25000", label: "₹25K+" },
  { value: "50000", label: "₹50K+" },
  { value: "100000", label: "₹1L+" },
]

export type MarketplaceQuery = { q: string; niche: string; platform: string; min: string; sort: string }

export function MarketplaceFilters({ initial }: { initial: MarketplaceQuery }) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const [query, setQuery] = useState(initial)
  const lastQ = useRef(initial.q)

  const push = (next: MarketplaceQuery) => {
    lastQ.current = next.q
    const params = new URLSearchParams()
    if (next.q.trim()) params.set("q", next.q.trim())
    if (next.niche) params.set("niche", next.niche)
    if (next.platform) params.set("platform", next.platform)
    if (next.min) params.set("min", next.min)
    if (next.sort && next.sort !== "newest") params.set("sort", next.sort)
    const qs = params.toString()
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }

  // Debounce free-text search; selects apply immediately.
  const pushRef = useRef(push)
  pushRef.current = push
  const queryRef = useRef(query)
  queryRef.current = query
  useEffect(() => {
    if (query.q === lastQ.current) return
    const t = setTimeout(() => pushRef.current(queryRef.current), 350)
    return () => clearTimeout(t)
  }, [query.q])

  const set = (key: keyof MarketplaceQuery, value: string) => {
    const next = { ...query, [key]: value === "all" ? "" : value }
    setQuery(next)
    if (key !== "q") push(next)
  }

  const active = Boolean(query.q || query.niche || query.platform || query.min)

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-xs md:flex-row md:items-center">
      <div className="relative flex-1">
        {pending ? (
          <Loader2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : (
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        )}
        <Input value={query.q} onChange={(e) => set("q", e.target.value)} placeholder="Search briefs, brands, products…" className="pl-9" aria-label="Search briefs" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Select value={query.niche || "all"} onValueChange={(v) => set("niche", v)}>
          <SelectTrigger className="w-full sm:w-[130px]" aria-label="Niche">
            <SelectValue placeholder="Niche" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All niches</SelectItem>
            {NICHES.map((n) => (
              <SelectItem key={n} value={n}>
                {nicheLabel(n)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={query.platform || "all"} onValueChange={(v) => set("platform", v)}>
          <SelectTrigger className="w-full sm:w-[130px]" aria-label="Platform">
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            {SOCIAL_PLATFORMS.map((p) => (
              <SelectItem key={p} value={p}>
                {platformLabel(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={query.min || "all"} onValueChange={(v) => set("min", v)}>
          <SelectTrigger className="w-full sm:w-[120px]" aria-label="Minimum budget">
            <SelectValue placeholder="Budget" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any budget</SelectItem>
            {BUDGETS.map((b) => (
              <SelectItem key={b.value} value={b.value}>
                {b.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={query.sort || "newest"} onValueChange={(v) => set("sort", v)}>
          <SelectTrigger className="w-full sm:w-[170px]" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="fit">Best fit on this page</SelectItem>
          </SelectContent>
        </Select>
        {active && (
          <Button
            variant="ghost"
            size="sm"
            className="col-span-2 sm:col-span-1"
            onClick={() => {
              const next = { q: "", niche: "", platform: "", min: "", sort: query.sort }
              setQuery(next)
              push(next)
            }}
          >
            <X className="size-3.5" /> Clear
          </Button>
        )}
      </div>
    </div>
  )
}
