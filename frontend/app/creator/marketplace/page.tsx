import Link from "next/link"
import { SearchX, Store } from "lucide-react"
import type { SocialPlatform } from "@hustl/contracts"
import { Button } from "@/components/ui/button"
import { EmptyState, PageHeader } from "@/components/app/ui"
import { BriefCard, type BriefFitSummary } from "@/components/creator/brief-card"
import { MarketplaceFilters } from "@/components/creator/marketplace-filters"
import { ErrorState } from "@/components/creator/states"
import { SOCIAL_PLATFORMS } from "@/components/creator/lib"
import { getBriefFit, getOpenBriefs, load, soft } from "../data"

export const metadata = { title: "Brand marketplace · hustl." }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const PAGE_SIZE = 20
/** AI scoring is one upstream call per brief — only ask for the cards at the top of the page. */
const FIT_LIMIT = 6

export default async function MarketplacePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const get = (k: string) => {
    const v = sp[k]
    return ((Array.isArray(v) ? v[0] : v) ?? "").trim()
  }
  const q = get("q")
  const niche = get("niche").toLowerCase()
  const platformParam = get("platform").toUpperCase()
  const platform = (SOCIAL_PLATFORMS as readonly string[]).includes(platformParam) ? (platformParam as SocialPlatform) : undefined
  const minBudget = Math.max(0, parseInt(get("min"), 10) || 0)
  const sort = get("sort") === "fit" ? "fit" : "newest"
  const page = Math.max(1, parseInt(get("page"), 10) || 1)

  const result = await load(() => getOpenBriefs({ q: q || undefined, niche: niche || undefined, platform, minBudget: minBudget || undefined, page, pageSize: PAGE_SIZE }))
  const filtered = Boolean(q || niche || platform || minBudget)
  const initial = { q, niche, platform: platform ?? "", min: minBudget ? String(minBudget) : "", sort }

  if (!result.ok) {
    return (
      <div>
        <PageHeader title="Brand marketplace" description="Live briefs from brands on hustl." />
        <MarketplaceFilters initial={initial} />
        <ErrorState error={result.error} />
      </div>
    )
  }

  const { items, meta } = result.data
  const fits = await Promise.all(items.slice(0, FIT_LIMIT).map((b) => soft(() => getBriefFit(b.id))))
  const fitById = new Map<string, BriefFitSummary>()
  fits.forEach((f) => f && fitById.set(f.briefId, f))

  const ordered = sort === "fit" ? [...items].sort((a, b) => (fitById.get(b.id)?.matchScore ?? -1) - (fitById.get(a.id)?.matchScore ?? -1)) : items
  const total = meta.total ?? items.length
  const totalPages = meta.totalPages ?? 1
  const pageHref = (n: number) => {
    const params = new URLSearchParams()
    if (q) params.set("q", q)
    if (niche) params.set("niche", niche)
    if (platform) params.set("platform", platform)
    if (minBudget) params.set("min", String(minBudget))
    if (sort !== "newest") params.set("sort", sort)
    if (n > 1) params.set("page", String(n))
    const qs = params.toString()
    return qs ? `/creator/marketplace?${qs}` : "/creator/marketplace"
  }

  return (
    <div>
      <PageHeader
        title="Brand marketplace"
        description="Live briefs from brands on hustl. Fit scores come from our matching model and are shown for the top briefs on each page — payments are escrow-protected on every deal."
        actions={
          <Button variant="outline" asChild>
            <Link href="/creator/profile">Improve my matches</Link>
          </Button>
        }
      />

      <MarketplaceFilters initial={initial} />

      {items.length > 0 && (
        <p className="mb-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{total}</span> live brief{total === 1 ? "" : "s"}
          {totalPages > 1 && (
            <>
              {" "}
              · page {meta.page ?? page} of {totalPages}
            </>
          )}
        </p>
      )}

      {items.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={SearchX}
            title="No briefs match these filters"
            description="Try a broader niche, a lower budget floor, or clear your search."
            action={
              <Button variant="outline" asChild>
                <Link href="/creator/marketplace">Clear filters</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Store}
            title="No live briefs right now"
            description="Brands post new briefs every week. Finish your profile so you're first in line when they do — we'll notify you about strong matches."
            action={
              <Button asChild>
                <Link href="/creator/profile">Complete profile</Link>
              </Button>
            }
          />
        )
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {ordered.map((brief) => (
              <BriefCard key={brief.id} brief={brief} fit={fitById.get(brief.id) ?? null} />
            ))}
          </div>
          {totalPages > 1 && (
            <nav className="mt-6 flex items-center justify-between gap-3" aria-label="Pagination">
              <Button variant="outline" size="sm" asChild disabled={page <= 1}>
                <Link href={pageHref(Math.max(1, page - 1))} aria-disabled={page <= 1}>
                  Previous
                </Link>
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {meta.page ?? page} of {totalPages}
              </span>
              <Button variant="outline" size="sm" asChild disabled={page >= totalPages}>
                <Link href={pageHref(Math.min(totalPages, page + 1))} aria-disabled={page >= totalPages}>
                  Next
                </Link>
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  )
}
