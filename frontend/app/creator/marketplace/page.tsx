import Link from "next/link"
import { SearchX, Store } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState, PageHeader } from "@/components/app/ui"
import { BriefCard } from "@/components/creator/brief-card"
import { MarketplaceFilters } from "@/components/creator/marketplace-filters"
import type { Deliverable } from "@/components/creator/lib"
import { applicationScore } from "@/lib/ai/match"
import { db, json } from "@/lib/db"
import { requireCreator } from "@/lib/session"

export const metadata = { title: "Brand marketplace · hustl." }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function MarketplacePage({ searchParams }: { searchParams: SearchParams }) {
  const { creator } = await requireCreator()
  const sp = await searchParams
  const get = (k: string) => {
    const v = sp[k]
    return ((Array.isArray(v) ? v[0] : v) ?? "").trim()
  }
  const q = get("q")
  const niche = get("niche").toLowerCase()
  const platform = get("platform").toLowerCase()
  const min = Math.max(0, parseInt(get("min"), 10) || 0)
  const sort = ["match", "newest", "budget"].includes(get("sort")) ? get("sort") : "match"
  const now = new Date()

  const [briefs, apps] = await Promise.all([
    db.brief.findMany({
      where: {
        status: "PUBLISHED",
        OR: [{ deadline: null }, { deadline: { gte: now } }],
        ...(min ? { budgetPerCreator: { gte: min } } : {}),
      },
      include: {
        brand: { select: { companyName: true, verified: true, logoUrl: true } },
        _count: { select: { applications: { where: { status: { not: "WITHDRAWN" } } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.application.findMany({ where: { creatorId: creator.id }, select: { briefId: true, status: true } }),
  ])
  const appStatus = new Map(apps.map((a) => [a.briefId, a.status]))
  const needle = q.toLowerCase()

  const results = briefs
    .filter((b) => !niche || b.niche.toLowerCase() === niche)
    .filter((b) => !platform || json<string[]>(b.platforms, []).some((p) => p.toLowerCase() === platform))
    .filter((b) => !needle || [b.title, b.description, b.brand.companyName, b.niche, b.audience].join(" ").toLowerCase().includes(needle))
    .map((b) => ({ brief: b, match: applicationScore(creator, b) }))
    .sort((a, b) =>
      sort === "newest"
        ? b.brief.createdAt.getTime() - a.brief.createdAt.getTime()
        : sort === "budget"
          ? b.brief.budgetPerCreator - a.brief.budgetPerCreator
          : b.match.score - a.match.score,
    )

  const strong = results.filter((r) => r.match.score >= 70 && r.match.disqualifiers.length === 0).length
  const filtered = Boolean(q || niche || platform || min)

  return (
    <div>
      <PageHeader
        title="Brand marketplace"
        description="Live briefs from brands on hustl. Your match score shows how well each one fits your profile — payments are escrow-protected on every deal."
        actions={
          <Button variant="outline" asChild>
            <Link href="/creator/profile">Improve my matches</Link>
          </Button>
        }
      />

      <MarketplaceFilters initial={{ q, niche, platform, min: min ? String(min) : "", sort }} />

      {results.length > 0 && (
        <p className="mb-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{results.length}</span> live brief{results.length === 1 ? "" : "s"}
          {strong > 0 && (
            <>
              {" "}
              · <span className="font-medium text-success">{strong} strong match{strong === 1 ? "" : "es"}</span>
            </>
          )}
        </p>
      )}

      {results.length === 0 ? (
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
        <div className="grid gap-4 lg:grid-cols-2">
          {results.map(({ brief, match }) => (
            <BriefCard
              key={brief.id}
              brief={{
                id: brief.id,
                title: brief.title,
                niche: brief.niche,
                budgetPerCreator: brief.budgetPerCreator,
                creatorsNeeded: brief.creatorsNeeded,
                platforms: json<string[]>(brief.platforms, []),
                deliverables: json<Deliverable[]>(brief.deliverables, []),
                deadline: brief.deadline,
                createdAt: brief.createdAt,
                applicants: brief._count.applications,
                brand: brief.brand,
              }}
              match={match}
              applicationStatus={appStatus.get(brief.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
