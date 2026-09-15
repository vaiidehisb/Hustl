import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { cache } from "react"
import { ArrowRight, BadgeCheck, Briefcase, Clock, ExternalLink, MapPin, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, Pill, ScoreRing } from "@/components/app/ui"
import { Container } from "@/components/marketing/section"
import { db, json } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { benchmarkER } from "@/lib/ai/scoring"
import { compact, inr, pct, shortDate } from "@/lib/format"

type Platform = { platform: string; handle?: string; followers?: number; engagementRate?: number; avgViews?: number }
type RateItem = { deliverable: string; price: number }
type PortfolioItem = { title: string; url?: string; brand?: string }

const getCreator = cache((handle: string) =>
  db.creatorProfile.findUnique({
    where: { handle: decodeURIComponent(handle).replace(/^@/, "").toLowerCase() },
    include: { user: { select: { id: true, name: true, image: true } } },
  }),
)

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params
  const c = await getCreator(handle)
  if (!c) return { title: "Creator not found" }
  const title = `${c.user.name} (@${c.handle})`
  const description = c.headline || c.bio.slice(0, 160) || `Work with ${c.user.name} on hustl. — escrow-protected brand deals.`
  return { title, description, openGraph: { title, description, images: c.avatarUrl ? [c.avatarUrl] : undefined } }
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
  const creator = await getCreator(handle)
  if (!creator) notFound()

  const [viewer, reviews, completedCount] = await Promise.all([
    getCurrentUser(),
    db.review.findMany({
      where: { subjectUserId: creator.userId },
      include: { author: { select: { name: true, image: true, brand: { select: { companyName: true, slug: true, logoUrl: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    db.deal.count({ where: { creatorId: creator.id, status: "COMPLETED" } }),
  ])

  const name = creator.user.name
  const platforms = json<Platform[]>(creator.platforms, [])
  const rateCard = json<RateItem[]>(creator.rateCard, [])
  const portfolio = json<PortfolioItem[]>(creator.portfolio, [])
  const niches = json<string[]>(creator.niches, [])
  const languages = json<string[]>(creator.languages, [])
  const completed = Math.max(completedCount, creator.completedDeals)
  const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : creator.avgRating

  const ctaHref = viewer?.role === "BRAND" ? `/brand/discover?q=${encodeURIComponent(creator.handle)}` : "/auth/signup?role=BRAND"
  const scores = [
    { label: "Trust", score: creator.trustScore },
    { label: "Reliability", score: creator.reliabilityScore },
    { label: "Niche authority", score: creator.nicheAuthority },
    { label: "Authenticity", score: creator.authenticityScore },
  ]

  return (
    <main className="pb-24">
      {/* Hero */}
      <section className="relative isolate overflow-hidden border-b">
        <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-40 bg-brand-gradient opacity-90 sm:h-48" />
        <Container className="pt-24 sm:pt-28">
          <div className="flex flex-col gap-6 pb-10 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
              <Avatar name={name} src={creator.avatarUrl ?? creator.user.image} size={112} className="ring-4 ring-background" />
              <div className="min-w-0">
                <h1 className="flex flex-wrap items-center gap-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                  {name}
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
                  {niches.slice(0, 4).map((n) => (
                    <Pill key={n} tone="info">
                      {n}
                    </Pill>
                  ))}
                </div>
              </div>
            </div>
            <Button asChild size="lg" className="h-12 rounded-full px-6">
              <Link href={ctaHref}>
                Work with {name.split(" ")[0]} <ArrowRight />
              </Link>
            </Button>
          </div>

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-t-2xl border-x border-t bg-border sm:grid-cols-4">
            {[
              { k: "Total followers", v: compact(creator.followers) },
              { k: "Avg. engagement", v: pct(creator.engagementRate) },
              { k: "Completed deals", v: String(completed) },
              { k: "Avg. rating", v: avgRating ? `${avgRating.toFixed(1)} ★` : "—" },
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
              {languages.length > 0 && <p className="mt-3 text-sm text-muted-foreground">Creates in {languages.join(", ")}</p>}
            </section>
          )}

          <section>
            <h2 className="font-display text-xl font-bold">Platforms</h2>
            {platforms.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No platforms connected yet.</p>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {platforms.map((p) => {
                  const followers = p.followers ?? 0
                  const er = p.engagementRate ?? 0
                  const ratio = followers ? er / benchmarkER(followers) : 0
                  return (
                    <div key={`${p.platform}-${p.handle}`} className="rounded-2xl border bg-card p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold capitalize">{p.platform.toLowerCase()}</div>
                          {p.handle && <div className="text-xs text-muted-foreground">@{p.handle.replace(/^@/, "")}</div>}
                        </div>
                        {ratio > 0 && (
                          <Pill tone={ratio >= 1 ? "success" : ratio >= 0.6 ? "info" : "warning"}>{ratio.toFixed(1)}× tier ER</Pill>
                        )}
                      </div>
                      <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <dt className="text-[11px] text-muted-foreground">Followers</dt>
                          <dd className="font-semibold tabular-nums">{compact(followers)}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] text-muted-foreground">Engagement</dt>
                          <dd className="font-semibold tabular-nums">{pct(er)}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] text-muted-foreground">Avg. views</dt>
                          <dd className="font-semibold tabular-nums">{p.avgViews ? compact(p.avgViews) : "—"}</dd>
                        </div>
                      </dl>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section>
            <h2 className="font-display text-xl font-bold">Portfolio</h2>
            {portfolio.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No portfolio items yet.</p>
            ) : (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {portfolio.map((item, i) => {
                  const body = (
                    <>
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
                        <Briefcase className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{item.title}</span>
                        {item.brand && <span className="block text-xs text-muted-foreground">for {item.brand}</span>}
                      </span>
                      {item.url && <ExternalLink className="size-4 shrink-0 text-muted-foreground" />}
                    </>
                  )
                  return (
                    <li key={`${item.title}-${i}`}>
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-3 rounded-2xl border bg-card p-4 transition hover:border-primary/40">
                          {body}
                        </a>
                      ) : (
                        <div className="flex items-center gap-3 rounded-2xl border bg-card p-4">{body}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-xl font-bold">Reviews from brands</h2>
              {reviews.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {avgRating.toFixed(1)} average · {reviews.length} review{reviews.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            {reviews.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No reviews yet.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {reviews.map((r) => {
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
            <div className="mt-4 grid grid-cols-4 gap-2">
              {scores.map((s) => (
                <ScoreRing key={s.label} score={s.score} size={52} label={s.label} />
              ))}
            </div>
            <div className="mt-4 flex items-center gap-4 border-t pt-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" /> Replies in ~{Math.round(creator.responseHours)}h
              </span>
              <span>{Math.round(creator.onTimeRate * 100)}% on time</span>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-5">
            <h2 className="text-sm font-semibold">Rate card</h2>
            {rateCard.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Rates shared on request.</p>
            ) : (
              <ul className="mt-3 divide-y">
                {rateCard.map((r) => (
                  <li key={r.deliverable} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span>{r.deliverable}</span>
                    <span className="font-semibold tabular-nums">{inr(r.price)}</span>
                  </li>
                ))}
              </ul>
            )}
            <Button asChild className="mt-4 h-11 w-full rounded-full">
              <Link href={ctaHref}>Work with {name.split(" ")[0]}</Link>
            </Button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">Paid through escrow · released on approval</p>
          </div>
        </aside>
      </Container>
    </main>
  )
}
