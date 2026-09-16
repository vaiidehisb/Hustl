import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { cache } from "react"
import { ArrowRight, BadgeCheck, Building2, Globe, MapPin, Star, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar } from "@/components/app/ui"
import { Container } from "@/components/marketing/section"
import { brands, isApiError } from "@/lib/api"
import { getSessionUser } from "@/lib/auth/session"
import { shortDate } from "@/lib/format"

const getBrand = cache(async (slug: string) => {
  try {
    return await brands.get(decodeURIComponent(slug))
  } catch (err) {
    if (isApiError(err) && err.status === 404) return null
    throw err
  }
})

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  try {
    const b = await getBrand(slug)
    if (!b) return { title: "Brand not found" }
    const description = b.description.slice(0, 160) || `${b.companyName} runs escrow-protected creator campaigns on hustl.`
    return { title: b.companyName, description, openGraph: { title: b.companyName, description, images: b.logoUrl ? [b.logoUrl] : undefined } }
  } catch {
    return { title: "Brand" }
  }
}

const hostname = (url: string) => {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

export default async function BrandProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [brand, viewer] = await Promise.all([getBrand(slug), getSessionUser()])
  if (!brand) notFound()

  const isCreator = viewer?.role === "CREATOR"
  const website = brand.website ? (brand.website.startsWith("http") ? brand.website : `https://${brand.website}`) : null
  const { reviewStats } = brand

  return (
    <main className="pb-24">
      <section className="relative isolate overflow-hidden border-b">
        <div aria-hidden className="absolute inset-0 -z-10 bg-grid opacity-50 [mask-image:radial-gradient(ellipse_70%_80%_at_50%_0%,black,transparent)]" />
        <Container className="py-14 sm:py-20">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              {brand.logoUrl ? (
                <Avatar name={brand.companyName} src={brand.logoUrl} size={88} className="rounded-2xl" />
              ) : (
                <span className="grid size-[88px] place-items-center rounded-2xl bg-accent font-display text-2xl font-bold text-accent-foreground">
                  {brand.companyName.slice(0, 2).toUpperCase()}
                </span>
              )}
              <div>
                <h1 className="flex flex-wrap items-center gap-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                  {brand.companyName}
                  {brand.verified && <BadgeCheck className="size-7 text-primary" aria-label="Verified brand" />}
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                  {brand.industry && (
                    <span className="inline-flex items-center gap-1.5">
                      <Building2 className="size-4" /> {brand.industry}
                    </span>
                  )}
                  {brand.location && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="size-4" /> {brand.location}
                    </span>
                  )}
                  {brand.size && (
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="size-4" /> {brand.size}
                    </span>
                  )}
                  {website && (
                    <a href={website} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 hover:text-foreground">
                      <Globe className="size-4" /> {hostname(brand.website)}
                    </a>
                  )}
                </div>
              </div>
            </div>
            {!isCreator && (
              <Button asChild size="lg" className="h-12 rounded-full px-6">
                <Link href="/auth/signup?role=CREATOR">
                  Join as a creator <ArrowRight />
                </Link>
              </Button>
            )}
          </div>

          <dl className="mt-10 grid grid-cols-3 gap-3 sm:max-w-xl">
            {[
              { k: "Live briefs", v: String(brand.openBriefs) },
              { k: "Completed deals", v: String(brand.completedDeals) },
              { k: "Creator rating", v: reviewStats.avgRating ? `${reviewStats.avgRating.toFixed(1)} ★` : "—" },
            ].map((s) => (
              <div key={s.k} className="rounded-2xl border bg-card px-4 py-3">
                <dt className="text-xs text-muted-foreground">{s.k}</dt>
                <dd className="mt-1 font-display text-xl font-bold tabular-nums">{s.v}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      <Container className="mt-10 grid gap-10 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-10">
          {brand.description && (
            <section>
              <h2 className="font-display text-xl font-bold">About</h2>
              <p className="mt-3 whitespace-pre-line leading-relaxed text-muted-foreground">{brand.description}</p>
            </section>
          )}

          <section>
            <h2 className="font-display text-xl font-bold">Live briefs</h2>
            {brand.openBriefs === 0 ? (
              <p className="mt-3 rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">No open briefs right now. Check back soon.</p>
            ) : (
              <div className="mt-4 flex flex-col items-start gap-4 rounded-2xl border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  {brand.companyName} has {brand.openBriefs} open brief{brand.openBriefs === 1 ? "" : "s"}.
                </p>
                <Button asChild className="rounded-full">
                  <Link href={isCreator ? `/creator/marketplace?q=${encodeURIComponent(brand.companyName)}` : "/auth/signup?role=CREATOR"}>
                    {isCreator ? "View in marketplace" : "Sign up to apply"} <ArrowRight />
                  </Link>
                </Button>
              </div>
            )}
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="font-display text-xl font-bold">Creator reviews</h2>
          {brand.reviews.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No reviews yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {brand.reviews.map((r) => (
                <li key={r.id} className="rounded-2xl border bg-card p-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={r.author.name} src={r.author.creator?.avatarUrl ?? r.author.image} size={32} />
                    <div className="min-w-0 flex-1">
                      {r.author.creator ? (
                        <Link href={`/creators/${r.author.creator.handle}`} className="block truncate text-sm font-semibold hover:underline">
                          {r.author.name}
                        </Link>
                      ) : (
                        <div className="truncate text-sm font-semibold">{r.author.name}</div>
                      )}
                      <div className="text-[11px] text-muted-foreground">{shortDate(r.createdAt)}</div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums">
                      <Star className="size-3.5 fill-warning text-warning" /> {r.rating}
                    </span>
                  </div>
                  {r.comment && <p className="mt-2.5 text-sm text-muted-foreground">{r.comment}</p>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-6 text-xs text-muted-foreground">On hustl. since {shortDate(brand.memberSince)}</p>
        </aside>
      </Container>
    </main>
  )
}
