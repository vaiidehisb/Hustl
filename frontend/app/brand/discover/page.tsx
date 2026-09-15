import Link from "next/link"
import { AlertTriangle, BadgeCheck, Check, MapPin, SearchX, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, EmptyState, PageHeader, Pill, ScoreRing } from "@/components/app/ui"
import { DiscoverToolbar, FilterFields, FOLLOWER_RANGES, type DiscoverParams } from "@/components/brand/discover-filters"
import { OfferDialog } from "@/components/brand/offer-dialog"
import { SaveCreatorButton } from "@/components/brand/save-button"
import { brandFee, creatorInclude, liveBriefOptions, toRowCreator } from "@/components/brand/data"
import { cap, minRate, type PlatformStat } from "@/components/brand/helpers"
import { db, json } from "@/lib/db"
import { matchScore, type MatchResult } from "@/lib/ai/match"
import { compact, inr, pct } from "@/lib/format"
import { requireBrand } from "@/lib/session"

export const metadata = { title: "Discover creators · hustl." }

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, brand } = await requireBrand()
  const raw = await searchParams
  const one = (k: string) => (typeof raw[k] === "string" && raw[k] ? (raw[k] as string) : undefined)
  const params: DiscoverParams = {
    q: one("q"),
    niche: one("niche"),
    platform: one("platform"),
    size: one("size"),
    er: one("er"),
    loc: one("loc"),
    verified: one("verified"),
    available: one("available"),
    saved: one("saved"),
    sort: one("sort"),
    brief: one("brief"),
  }

  const [creators, savedRows, briefOptions, briefRecord] = await Promise.all([
    db.creatorProfile.findMany({
      where: {
        ...(params.verified === "1" ? { verified: true } : {}),
        ...(params.available === "1" ? { available: true } : {}),
        ...(params.saved === "1" ? { savedBy: { some: { brandId: brand.id } } } : {}),
      },
      include: creatorInclude,
    }),
    db.savedCreator.findMany({ where: { brandId: brand.id }, select: { creatorId: true } }),
    liveBriefOptions(brand.id),
    params.brief ? db.brief.findFirst({ where: { id: params.brief, brandId: brand.id } }) : null,
  ])
  const saved = new Set(savedRows.map((s) => s.creatorId))

  const q = params.q?.toLowerCase().replace(/^@/, "")
  const range = FOLLOWER_RANGES.find((r) => r.value === params.size)
  const minER = params.er ? Number(params.er) / 100 : 0
  const loc = params.loc?.toLowerCase()

  const filtered = creators.filter((c) => {
    const niches = json<string[]>(c.niches, []).map((n) => n.toLowerCase())
    const platforms = json<PlatformStat[]>(c.platforms, []).map((p) => p.platform.toLowerCase())
    if (q && ![c.user.name, c.handle, c.headline, c.bio].some((s) => s.toLowerCase().includes(q))) return false
    if (params.niche && !niches.includes(params.niche)) return false
    if (params.platform && !platforms.includes(params.platform)) return false
    if (range && (c.followers < range.min || c.followers >= range.max)) return false
    if (minER && c.engagementRate < minER) return false
    if (loc && !c.location.toLowerCase().includes(loc)) return false
    return true
  })

  const results: { c: (typeof filtered)[number]; match: MatchResult | null }[] = filtered.map((c) => ({ c, match: briefRecord ? matchScore(c, briefRecord) : null }))
  const sort = params.sort ?? "match"
  const quality = (c: (typeof filtered)[number]) => c.trustScore * 0.5 + c.authenticityScore * 0.3 + c.reliabilityScore * 0.2
  results.sort((a, b) => {
    if (sort === "followers") return b.c.followers - a.c.followers
    if (sort === "engagement") return b.c.engagementRate - a.c.engagementRate
    if (sort === "trust") return b.c.trustScore - a.c.trustScore
    return a.match && b.match ? b.match.score - a.match.score : quality(b.c) - quality(a.c)
  })

  const feePct = brandFee(brand.plan)
  const offerBrief = briefRecord ? briefOptions.find((b) => b.id === briefRecord.id) ?? null : null

  return (
    <div>
      <PageHeader
        title="Discover creators"
        description="Search verified creators, filter by audience and performance, and rank them against a brief with AI matching."
      />

      <DiscoverToolbar params={params} briefs={briefOptions.map((b) => ({ id: b.id, title: b.title }))} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-xl border bg-card p-4">
            <FilterFields params={params} />
          </div>
        </aside>

        <div className="min-w-0">
          <p className="mb-3 text-sm text-muted-foreground">
            {results.length} creator{results.length === 1 ? "" : "s"}
            {briefRecord && (
              <>
                {" "}
                ranked for <span className="font-medium text-foreground">{briefRecord.title}</span>
              </>
            )}
          </p>

          {results.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title={params.saved === "1" && saved.size === 0 ? "No saved creators yet" : "No creators match these filters"}
              description={params.saved === "1" && saved.size === 0 ? "Tap the bookmark on any creator to build a shortlist." : "Try widening the follower range, lowering minimum engagement or clearing the location."}
              action={
                <Button variant="outline" asChild>
                  <Link href="/brand/discover">Reset all filters</Link>
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {results.map(({ c, match }) => {
                const row = toRowCreator(c)
                const niches = json<string[]>(c.niches, [])
                const from = minRate(c.rateCard)
                return (
                  <article key={c.id} className="flex flex-col rounded-xl border bg-card p-5 shadow-xs transition-shadow hover:shadow-md">
                    <div className="flex items-start gap-3">
                      <Avatar name={row.name} src={row.avatarUrl} size={48} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <Link href={`/creators/${c.handle}`} className="truncate font-semibold hover:underline">
                            {row.name}
                          </Link>
                          {c.verified && <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Verified" />}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          @{c.handle}
                          {c.location && (
                            <>
                              {" · "}
                              <MapPin className="inline size-3 -translate-y-px" /> {c.location}
                            </>
                          )}
                        </p>
                      </div>
                      {match ? <ScoreRing score={match.score} size={42} /> : <SaveCreatorButton creatorId={c.id} saved={saved.has(c.id)} name={row.name} />}
                    </div>

                    {c.headline && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{c.headline}</p>}

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {niches.slice(0, 3).map((n) => (
                        <Pill key={n}>{cap(n)}</Pill>
                      ))}
                      {!c.available && <Pill tone="warning">Unavailable</Pill>}
                    </div>

                    <dl className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3 text-center">
                      <Stat label="Followers" value={compact(c.followers)} />
                      <Stat label="Eng. rate" value={pct(c.engagementRate)} />
                      <Stat label="Trust" value={String(c.trustScore)} />
                    </dl>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <ShieldCheck className={c.authenticityScore >= 70 ? "size-3.5 text-success" : "size-3.5 text-warning"} />
                        {c.authenticityScore}% authentic audience
                      </span>
                      <span>{c.completedDeals} deals</span>
                    </div>

                    {match && (
                      <div className="mt-3 space-y-1">
                        {match.reasons.slice(0, 2).map((r) => (
                          <p key={r} className="flex items-start gap-1.5 text-xs">
                            <Check className="mt-0.5 size-3 shrink-0 text-success" /> {r}
                          </p>
                        ))}
                        {match.disqualifiers.map((d) => (
                          <p key={d} className="flex items-start gap-1.5 text-xs text-warning">
                            <AlertTriangle className="mt-0.5 size-3 shrink-0" /> {d}
                          </p>
                        ))}
                      </div>
                    )}

                    <div className="mt-auto flex items-center gap-2 pt-4">
                      <div className="mr-auto">
                        <div className="text-[11px] text-muted-foreground">from</div>
                        <div className="text-sm font-semibold tabular-nums">{from ? inr(from) : "On request"}</div>
                      </div>
                      {match && <SaveCreatorButton creatorId={c.id} saved={saved.has(c.id)} name={row.name} />}
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/creators/${c.handle}`}>Profile</Link>
                      </Button>
                      <OfferDialog
                        creator={{ id: c.id, name: row.name, handle: c.handle, avatarUrl: row.avatarUrl, reliabilityScore: c.reliabilityScore }}
                        brief={offerBrief}
                        briefs={briefOptions}
                        amount={offerBrief?.budgetPerCreator || from}
                        brandFeePct={feePct}
                        kycVerified={user.kycVerified}
                      />
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  )
}
