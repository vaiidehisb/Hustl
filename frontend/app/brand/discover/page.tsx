import Link from "next/link"
import { AlertTriangle, BadgeCheck, Check, MapPin, SearchX, ShieldCheck, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, EmptyState, PageHeader, Pill, ScoreRing } from "@/components/app/ui"
import { DiscoverToolbar, FilterFields, FOLLOWER_RANGES, type DiscoverParams } from "@/components/brand/discover-filters"
import { OfferDialog, type OfferBrief } from "@/components/brand/offer-dialog"
import { SaveCreatorButton } from "@/components/brand/save-button"
import { AiErrorPanel, ErrorPanel } from "@/components/brand/error-panel"
import { loadBriefs, loadMatches, loadMe, loadSaved, loadSearch, type SerializedApiError } from "@/components/brand/data"
import { cap } from "@/components/brand/helpers"
import { compact, inr, pct } from "@/lib/format"

export const metadata = { title: "Discover creators · hustl." }

type Row = {
  id: string
  handle: string
  name: string
  avatarUrl: string | null
  headline: string
  location: string
  niches: string[]
  followers: number
  engagementRate: number | null
  trustScore: number | null
  authenticityScore: number | null
  reliabilityScore: number | null
  verified: boolean
  available: boolean
  completedDeals: number | null
  match?: { score: number; reasons: string[]; disqualifiers: string[] }
}

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
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

  const range = FOLLOWER_RANGES.find((r) => r.value === params.size)
  const showSaved = params.saved === "1"
  const matchBriefId = params.brief && params.brief !== "any" ? params.brief : undefined

  const [meRes, briefsRes, savedRes] = await Promise.all([loadMe(), loadBriefs({ status: "PUBLISHED", pageSize: 50 }), loadSaved()])

  const [searchRes, matchesRes] = await Promise.all([
    !showSaved && !matchBriefId
      ? loadSearch({
          q: params.q,
          niche: params.niche,
          platform: params.platform,
          minFollowers: range?.min,
          maxFollowers: range && Number.isFinite(range.max) ? range.max : undefined,
          // the contract takes a percentage here (3 = 3%)
          minEngagement: params.er ? Number(params.er) : undefined,
          location: params.loc,
          verified: params.verified === "1" ? true : undefined,
          available: params.available === "1" ? true : undefined,
          sort: params.sort,
        })
      : null,
    matchBriefId ? loadMatches(matchBriefId, 24) : null,
  ])

  const plan = meRes.ok ? (meRes.data.brand?.plan ?? "STARTER") : "STARTER"
  const kycVerified = meRes.ok && meRes.data.user.kycStatus === "VERIFIED"
  const savedIds = new Set(savedRes.ok ? savedRes.data.map((s) => s.creator.id) : [])

  const briefOptions: OfferBrief[] = briefsRes.ok
    ? briefsRes.data.map((b) => ({ id: b.id, title: b.title, deliverables: b.deliverables, budgetPerCreator: b.budgetPerCreator }))
    : []
  const matchBrief = matchBriefId ? (briefOptions.find((b) => b.id === matchBriefId) ?? null) : null

  let rows: Row[] = []
  let error: SerializedApiError | null = null
  let engine: string | undefined

  if (showSaved) {
    if (savedRes.ok)
      rows = savedRes.data.map((s) => ({
        ...s.creator,
        headline: s.creator.headline,
        followers: s.creator.followersTotal,
        trustScore: null,
        authenticityScore: null,
        reliabilityScore: null,
        completedDeals: null,
      }))
    else error = savedRes.error
  } else if (matchesRes) {
    if (matchesRes.ok)
      rows = matchesRes.data.matches.map((m) => ({
        id: m.creator.id,
        handle: m.creator.handle,
        name: m.creator.name,
        avatarUrl: m.creator.avatarUrl,
        headline: m.creator.headline,
        location: m.creator.location,
        niches: m.creator.niches,
        followers: m.creator.followersTotal,
        engagementRate: m.creator.engagementRate,
        trustScore: m.creator.trustScore,
        authenticityScore: null,
        reliabilityScore: m.creator.reliabilityScore,
        verified: m.creator.verified,
        available: m.creator.available,
        completedDeals: m.creator.completedDeals,
        match: { score: Math.round(m.matchScore), reasons: m.matchReasons, disqualifiers: m.disqualifiers },
      }))
  } else if (searchRes) {
    if (searchRes.ok) {
      engine = searchRes.meta.engine
      rows = searchRes.data.map((c) => ({
        id: c.id,
        handle: c.handle,
        name: c.name,
        avatarUrl: c.avatarUrl,
        headline: c.headline,
        location: c.location,
        niches: c.niches,
        followers: c.followers,
        engagementRate: c.engagementRate,
        trustScore: c.trustScore,
        authenticityScore: c.authenticityScore,
        reliabilityScore: c.reliabilityScore,
        verified: c.verified,
        available: c.available,
        completedDeals: c.completedDeals,
      }))
    } else error = searchRes.error
  }

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
          <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              {rows.length} creator{rows.length === 1 ? "" : "s"}
              {matchBrief && (
                <>
                  {" "}
                  ranked for <span className="font-medium text-foreground">{matchBrief.title}</span>
                </>
              )}
              {showSaved && " saved"}
            </span>
            {matchBriefId && (
              <Pill tone="brand">
                <Sparkles className="size-3" /> AI ranked — search filters don't apply
              </Pill>
            )}
            {engine === "postgres" && <span className="text-xs">Full-text search index offline — using the database engine.</span>}
          </p>

          {matchesRes && !matchesRes.ok ? (
            <AiErrorPanel error={matchesRes.error} />
          ) : error ? (
            <ErrorPanel error={error} title="Couldn't load creators" />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title={showSaved ? "No saved creators yet" : "No creators match these filters"}
              description={
                showSaved
                  ? "Tap the bookmark on any creator to build a shortlist."
                  : "Try widening the follower range, lowering minimum engagement or clearing the location."
              }
              action={
                <Button variant="outline" asChild>
                  <Link href="/brand/discover">Reset all filters</Link>
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {rows.map((c) => (
                <article key={c.id} className="flex flex-col rounded-xl border bg-card p-5 shadow-xs transition-shadow hover:shadow-md">
                  <div className="flex items-start gap-3">
                    <Avatar name={c.name} src={c.avatarUrl} size={48} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <Link href={`/creators/${c.handle}`} className="truncate font-semibold hover:underline">
                          {c.name}
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
                    {c.match ? <ScoreRing score={c.match.score} size={42} /> : <SaveCreatorButton creatorId={c.id} saved={savedIds.has(c.id)} name={c.name} />}
                  </div>

                  {c.headline && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{c.headline}</p>}

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {c.niches.slice(0, 3).map((n) => (
                      <Pill key={n}>{cap(n)}</Pill>
                    ))}
                    {!c.available && <Pill tone="warning">Unavailable</Pill>}
                  </div>

                  <dl className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3 text-center">
                    <Stat label="Followers" value={compact(c.followers)} />
                    <Stat label="Eng. rate" value={c.engagementRate === null ? "—" : pct(c.engagementRate)} />
                    <Stat label="Trust" value={c.trustScore === null ? "—" : String(c.trustScore)} />
                  </dl>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <ShieldCheck className={c.authenticityScore !== null && c.authenticityScore >= 70 ? "size-3.5 text-success" : "size-3.5 text-warning"} />
                      {c.authenticityScore === null ? "Authenticity not scored" : `${c.authenticityScore}% authentic audience`}
                    </span>
                    <span>{c.completedDeals === null ? "" : `${c.completedDeals} deals`}</span>
                  </div>

                  {c.match && (
                    <div className="mt-3 space-y-1">
                      {c.match.reasons.slice(0, 2).map((r) => (
                        <p key={r} className="flex items-start gap-1.5 text-xs">
                          <Check className="mt-0.5 size-3 shrink-0 text-success" /> {r}
                        </p>
                      ))}
                      {c.match.disqualifiers.map((d) => (
                        <p key={d} className="flex items-start gap-1.5 text-xs text-warning">
                          <AlertTriangle className="mt-0.5 size-3 shrink-0" /> {d}
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="mt-auto flex items-center gap-2 pt-4">
                    <div className="mr-auto">
                      <div className="text-[11px] text-muted-foreground">budget</div>
                      <div className="text-sm font-semibold tabular-nums">{matchBrief?.budgetPerCreator ? inr(matchBrief.budgetPerCreator) : "On request"}</div>
                    </div>
                    {c.match && <SaveCreatorButton creatorId={c.id} saved={savedIds.has(c.id)} name={c.name} />}
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/creators/${c.handle}`}>Profile</Link>
                    </Button>
                    <OfferDialog
                      creator={{ id: c.id, name: c.name, handle: c.handle, avatarUrl: c.avatarUrl, reliabilityScore: c.reliabilityScore }}
                      brief={matchBrief}
                      briefs={briefOptions}
                      amount={matchBrief?.budgetPerCreator ?? null}
                      brandPlan={plan}
                      kycVerified={kycVerified}
                    />
                  </div>
                </article>
              ))}
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
