import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { cache } from "react"
import { ArrowRight, BadgeCheck, Briefcase, ExternalLink, MapPin, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, Pill, ScoreRing } from "@/components/app/ui"
import { Container } from "@/components/marketing/section"
import { creators, isApiError } from "@/lib/api"
import { getSessionUser } from "@/lib/auth/session"
import { compact, inr, pct, shortDate } from "@/lib/format"

const getCreator = cache(async (handle: string) => {
  try {
    return await creators.get(decodeURIComponent(handle))
  } catch (err) {
    if (isApiError(err) && err.status === 404) return null
    throw err
  }
})

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params
  try {
    const c = await getCreator(handle)
    if (!c) return { title: "Creator not found" }
    const title = `${c.name} (@${c.handle})`
    const description = c.headline || c.bio.slice(0, 160) || `Work with ${c.name} on hustl.: escrow-protected brand deals.`
    return { title, description, openGraph: { title, description, images: c.avatarUrl ? [c.avatarUrl] : undefined } }
  } catch {
    return { title: "Creator" }
  }
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={i < Math.round(rating) ? "size-3.5 fill-warning text-warning" : "size-3.5 text-muted-foreground/40"} />
      ))}
    </span>
  )
}

export default async function CreatorProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const [creator, viewer] = await Promise.all([getCreator(handle), getSessionUser()])
  if (!creator) notFound()

  const firstName = creator.name.split(" ")[0]
  const { reviewStats, scores } = creator
  const ctaHref = viewer?.role === "BRAND" ? `/brand/discover?q=${encodeURIComponent(creator.handle)}` : "/auth/signup?role=BRAND"
  const scoreRings = scores
    ? [
        { label: "Trust", score: scores.trustScore },
        { label: "Reliability", score: scores.reliabilityScore },
        { label: "Niche authority", score: scores.nicheAuthority },
        ...(scores.authenticityScore !== null ? [{ label: "Authenticity", score: scores.authenticityScore }] : []),
      ]
    : []

  return (
    <main className="pb-24">
      <section className="relative isolate overflow-hidden border-b">
        <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-40 bg-brand-gradient opacity-90 sm:h-48" />
        <Container className="pt-24 sm:pt-28">
          <div className="flex flex-col gap-6 pb-10 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
              <Avatar name={creator.name} src={creator.avatarUrl} size={112} className="ring-4 ring-background" />
              <div className="min-w-0">
                <h1 className="flex flex-wrap items-center gap-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                  {creator.name}
                  {creator.verified && <BadgeCheck className="size-7 text-primary" aria-label="Verified creator" />}
                </h1>
                <div className="mt-1 text-muted-foreground">@{creator.handle}</div>
                {creator.headline && <p className="mt-2 max-w-xl text-pretty">{creator.headline}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {creator.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-4" /> {creator.location}
                    </span>
                  )}
                  {creator.available ? (
                    <Pill tone="success">
                      <span className="size-1.5 rounded-full bg-current" /> Available for deals
                    </Pill>
                  ) : (
                    <Pill>Not taking new deals</Pill>
                  )}
                  {creator.niches.slice(0, 4).map((n) => (
                    <Pill key={n} tone="info">
                      {n}
                    </Pill>
                  ))}
                </div>
              </div>
            </div>
            <Button asChild size="lg" className="h-12 rounded-full px-6">
              <Link href={ctaHref}>
                Work with {firstName} <ArrowRight />
              </Link>
            </Button>
          </div>

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-t-2xl border-x border-t bg-border sm:grid-cols-4">
            {[
              { k: "Total followers", v: creator.followersTotal ? compact(creator.followersTotal) : "—" },
              { k: "Avg. engagement", v: creator.engagementRate !== null ? pct(creator.engagementRate) : "—" },
              { k: "Completed deals", v: String(creator.completedDeals) },
              { k: "Avg. rating", v: reviewStats.avgRating ? `${reviewStats.avgRating.toFixed(1)} ★` : "—" },
            ].map((s) => (
              <div key={s.k} className="bg-card px-5 py-4">
                <dt className="text-xs text-muted-foreground">{s.k}</dt>
                <dd className="mt-1 font-display text-xl font-bold tabular-nums">{s.v}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      <Container className="mt-10 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-8">
          {creator.bio && (
            <section>
              <h2 className="font-display text-xl font-bold">About</h2>
              <p className="mt-3 whitespace-pre-line leading-relaxed text-muted-foreground">{creator.bio}</p>
              {creator.languages.length > 0 && <p className="mt-3 text-sm text-muted-foreground">Creates in {creator.languages.join(", ")}</p>}
            </section>
          )}

          <section>
            <h2 className="font-display text-xl font-bold">Platforms</h2>
            {creator.socialAccounts.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No platforms connected yet.</p>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {creator.socialAccounts.map((a) => (
                  <div key={`${a.platform}-${a.handle}`} className="rounded-2xl border bg-card p-5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold capitalize">{a.platform.toLowerCase()}</div>
                        {a.profileUrl ? (
                          <a href={a.profileUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-muted-foreground hover:underline">
                            @{a.handle.replace(/^@/, "")}
                          </a>
                        ) : (
                          <div className="text-xs text-muted-foreground">@{a.handle.replace(/^@/, "")}</div>
                        )}
                      </div>
                      {a.source === "SELF_REPORTED" ? <Pill tone="warning">Self-reported, unverified</Pill> : <Pill tone="success">Verified data</Pill>}
                    </div>
                    <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <dt className="text-[11px] text-muted-foreground">Followers</dt>
                        <dd className="font-semibold tabular-nums">{a.followers !== null ? compact(a.followers) : "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-muted-foreground">Engagement</dt>
                        <dd className="font-semibold tabular-nums">{a.engagementRate !== null ? pct(a.engagementRate) : "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-muted-foreground">Avg. views</dt>
                        <dd className="font-semibold tabular-nums">{a.avgViews ? compact(a.avgViews) : "—"}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="font-display text-xl font-bold">Portfolio</h2>
            {creator.portfolio.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No portfolio items yet.</p>
            ) : (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {creator.portfolio.map((item, i) => (
                  <li key={`${item.title}-${i}`}>
                    <a href={item.url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-3 rounded-2xl border bg-card p-4 transition hover:border-primary/40">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
                        <Briefcase className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{item.title}</span>
                        {item.brand && <span className="block text-xs text-muted-foreground">for {item.brand}</span>}
                      </span>
                      <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {creator.workedWith.length > 0 && (
            <section>
              <h2 className="font-display text-xl font-bold">Worked with</h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {creator.workedWith.map((b) => (
                  <li key={b.slug}>
                    <Link href={`/brands/${b.slug}`} className="flex items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-3 text-sm font-medium transition hover:border-primary/40">
                      <Avatar name={b.companyName} src={b.logoUrl} size={24} />
                      {b.companyName}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-xl font-bold">Reviews from brands</h2>
              {reviewStats.count > 0 && reviewStats.avgRating !== null && (
                <span className="text-sm text-muted-foreground">
                  {reviewStats.avgRating.toFixed(1)} average · {reviewStats.count} review{reviewStats.count === 1 ? "" : "s"}
                </span>
              )}
            </div>
            {creator.reviews.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No reviews yet.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {creator.reviews.map((r) => {
                  const who = r.author.brand?.companyName ?? r.author.name
                  return (
                    <li key={r.id} className="rounded-2xl border bg-card p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar name={who} src={r.author.brand?.logoUrl ?? r.author.image} size={36} />
                          <div className="min-w-0">
                            {r.author.brand ? (
                              <Link href={`/brands/${r.author.brand.slug}`} className="block truncate text-sm font-semibold hover:underline">
                                {who}
                              </Link>
                            ) : (
                              <div className="truncate text-sm font-semibold">{who}</div>
                            )}
                            <div className="text-xs text-muted-foreground">{shortDate(r.createdAt)}</div>
                          </div>
                        </div>
                        <Stars rating={r.rating} />
                      </div>
                      {r.comment && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{r.comment}</p>}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border bg-card p-5">
            <h2 className="text-sm font-semibold">hustl. scores</h2>
            {scoreRings.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Scores appear once enough verified data is available.</p>
            ) : (
              <div className="mt-4 grid grid-cols-4 gap-2">
                {scoreRings.map((s) => (
                  <ScoreRing key={s.label} score={s.score} size={52} label={s.label} />
                ))}
              </div>
            )}
            {creator.onTimeRate !== null && (
              <div className="mt-4 border-t pt-4 text-xs text-muted-foreground">{Math.round(creator.onTimeRate * 100)}% delivered on time</div>
            )}
          </div>

          <div className="rounded-2xl border bg-card p-5">
            <h2 className="text-sm font-semibold">Rate card</h2>
            {creator.rateCard.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Rates shared on request.</p>
            ) : (
              <ul className="mt-3 divide-y">
                {creator.rateCard.map((r) => (
                  <li key={r.deliverable} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span>{r.deliverable}</span>
                    <span className="font-semibold tabular-nums">{inr(r.price)}</span>
                  </li>
                ))}
              </ul>
            )}
            <Button asChild className="mt-4 h-11 w-full rounded-full">
              <Link href={ctaHref}>Work with {firstName}</Link>
            </Button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">Paid through escrow · released on approval</p>
          </div>
          <p className="text-center text-xs text-muted-foreground">On hustl. since {shortDate(creator.memberSince)}</p>
        </aside>
      </Container>
    </main>
  )
}
