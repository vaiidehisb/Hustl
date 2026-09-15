import Link from "next/link"
import { notFound } from "next/navigation"
import { AlertTriangle, ArrowLeft, ArrowRight, BadgeCheck, CalendarClock, CheckCircle2, Globe, IndianRupee, Lightbulb, Lock, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, PageHeader, Panel, Pill, ScoreRing, StatusBadge, TextLink } from "@/components/app/ui"
import { ApplyForm } from "@/components/creator/apply-form"
import { WithdrawButton } from "@/components/creator/withdraw-button"
import { deadlineLabel, nicheLabel, platformLabel, type Deliverable, type SocialAccount } from "@/components/creator/lib"
import { applicationScore, type MatchResult } from "@/lib/ai/match"
import { db, json } from "@/lib/db"
import { compact, inr, pct, shortDate, timeAgo } from "@/lib/format"
import { requireCreator } from "@/lib/session"

export const metadata = { title: "Brief · hustl." }

type Creator = Awaited<ReturnType<typeof requireCreator>>["creator"]
type Tip = { text: string; href?: string; cta?: string }

function fitTips(creator: Creator, brief: { niche: string; platforms: string[]; minFollowers: number; minEngagement: number }, match: MatchResult): Tip[] {
  const tips: Tip[] = []
  const connected = json<SocialAccount[]>(creator.platforms, []).map((p) => p.platform.toLowerCase())
  const missing = brief.platforms.filter((p) => !connected.includes(p.toLowerCase()))
  if (brief.platforms.length && missing.length === brief.platforms.length)
    tips.push({ text: `This brief needs ${missing.map(platformLabel).join(" or ")}. If you post there, connect the account.`, href: "/creator/settings", cta: "Connect socials" })
  if (brief.minFollowers && creator.followers < brief.minFollowers)
    tips.push({ text: `The brand asks for ${compact(brief.minFollowers)}+ followers; you have ${compact(creator.followers)}. You can still apply — lead with engagement and past results.` })
  if (brief.minEngagement && creator.engagementRate < brief.minEngagement)
    tips.push({ text: `Target engagement is ${pct(brief.minEngagement)}; yours is ${pct(creator.engagementRate)}. Mention a recent post that beat your average.` })
  const niches = json<string[]>(creator.niches, []).map((n) => n.toLowerCase())
  if (brief.niche && !niches.includes(brief.niche.toLowerCase()))
    tips.push({ text: `${nicheLabel(brief.niche)} isn't one of your niches. If you genuinely create in it, add it to your profile.`, href: "/creator/profile#niches", cta: "Edit niches" })
  if (!creator.available) tips.push({ text: "You're marked as unavailable, which brands see as a red flag.", href: "/creator/profile", cta: "Turn on availability" })
  if (!creator.socialsConnected) tips.push({ text: "Synced social stats make your numbers credible to brands.", href: "/creator/settings", cta: "Sync socials" })
  if (json<unknown[]>(creator.portfolio, []).length === 0) tips.push({ text: "Add portfolio links — brands open them before shortlisting.", href: "/creator/profile#portfolio", cta: "Add work" })
  if (tips.length === 0 && match.score >= 70) tips.push({ text: "You're a strong fit. Open your pitch with a specific content idea for their product." })
  if (tips.length === 0) tips.push({ text: "Make your pitch specific: an idea, a relevant past result and a delivery date." })
  return tips.slice(0, 4)
}

function FitPanel({ match, tips, appliedScore }: { match: MatchResult; tips: Tip[]; appliedScore?: number }) {
  const verdict =
    match.disqualifiers.length > 0 ? "Some gaps to address" : match.score >= 80 ? "Excellent fit" : match.score >= 60 ? "Good fit" : match.score >= 40 ? "Partial fit" : "Long shot"
  return (
    <Panel title="Your fit" description="How our matching engine sees you for this brief.">
      <div className="flex items-center gap-4">
        <ScoreRing score={match.score} size={72} />
        <div>
          <div className="font-semibold">{verdict}</div>
          <p className="text-xs text-muted-foreground">
            Based on niche, platforms, audience size, engagement and reliability.
            {appliedScore !== undefined && appliedScore !== match.score && <> Scored {appliedScore} when you applied.</>}
          </p>
        </div>
      </div>
      {match.reasons.length > 0 && (
        <ul className="mt-4 space-y-2">
          {match.reasons.map((r) => (
            <li key={r} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
              {r}
            </li>
          ))}
        </ul>
      )}
      {match.disqualifiers.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {match.disqualifiers.map((d) => (
            <li key={d} className="flex items-start gap-2 rounded-md bg-warning-soft px-2.5 py-1.5 text-sm font-medium text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {d}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 border-t pt-4">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Lightbulb className="size-3.5" /> Tips to improve
        </div>
        <ul className="space-y-2.5">
          {tips.map((t) => (
            <li key={t.text} className="text-sm text-muted-foreground">
              {t.text}
              {t.href && (
                <>
                  {" "}
                  <TextLink href={t.href}>{t.cta ?? "Fix"} →</TextLink>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  )
}

const STATUS_COPY: Record<string, string> = {
  APPLIED: "The brand has your pitch. You'll be notified the moment they shortlist you, send an offer or close the brief.",
  SHORTLISTED: "You're on the shortlist — the brand is comparing a few creators. Keep notifications on so you can reply to an offer quickly.",
  OFFERED: "The brand sent you an offer. Review the terms, counter if needed, and sign — payment is locked in escrow before you start.",
  REJECTED: "The brand went with other creators this time. Use the fit insights to sharpen your next pitch.",
}

export default async function BriefDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { creator } = await requireCreator()

  const brief = await db.brief.findUnique({
    where: { id },
    include: { brand: true, _count: { select: { applications: { where: { status: { not: "WITHDRAWN" } } } } } },
  })
  if (!brief) notFound()
  const application = await db.application.findUnique({ where: { briefId_creatorId: { briefId: id, creatorId: creator.id } } })
  if (brief.status !== "PUBLISHED" && !application) notFound()

  const [brandCompleted, brandLive, offerDeal] = await Promise.all([
    db.deal.count({ where: { brandId: brief.brandId, status: "COMPLETED" } }),
    db.brief.count({ where: { brandId: brief.brandId, status: "PUBLISHED" } }),
    application?.status === "OFFERED"
      ? db.deal.findFirst({
          where: { creatorId: creator.id, OR: [{ applicationId: application.id }, { briefId: id }] },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        })
      : Promise.resolve(null),
  ])

  const platforms = json<string[]>(brief.platforms, [])
  const deliverables = json<Deliverable[]>(brief.deliverables, [])
  const match = applicationScore(creator, brief)
  const tips = fitTips(creator, { ...brief, platforms }, match)
  const closed = brief.status !== "PUBLISHED" || (brief.deadline !== null && brief.deadline < new Date())
  const deadline = deadlineLabel(brief.deadline)
  const activeApp = application && application.status !== "WITHDRAWN" ? application : null

  const requirements: [string, React.ReactNode][] = [
    ["Deliverables", deliverables.length ? deliverables.map((d) => `${d.quantity} × ${d.type}`).join(", ") : "To be agreed"],
    ["Platforms", platforms.length ? platforms.map(platformLabel).join(", ") : "Any"],
    ["Niche", brief.niche ? nicheLabel(brief.niche) : "Open"],
    ["Min. followers", brief.minFollowers ? `${compact(brief.minFollowers)}+` : "No minimum"],
    ["Min. engagement", brief.minEngagement ? `${pct(brief.minEngagement)}+` : "No minimum"],
    ["Target audience", brief.audience || "—"],
    ["Location", brief.location || "Pan-India"],
    ["Timeline", brief.timeline || "Flexible"],
  ]

  const fit = <FitPanel match={match} tips={tips} appliedScore={activeApp?.matchScore} />

  return (
    <div>
      <Link href="/creator/marketplace" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Marketplace
      </Link>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1 normal-case tracking-normal">
            {brief.brand.companyName}
            {brief.brand.verified && <BadgeCheck className="size-3.5 text-primary" />}
            {closed && (
              <Pill className="ml-2" tone="neutral">
                Closed
              </Pill>
            )}
          </span>
        }
        title={brief.title}
        description={`Posted ${timeAgo(brief.createdAt)}`}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: IndianRupee, label: "Budget per creator", value: brief.budgetPerCreator ? inr(brief.budgetPerCreator) : "Open" },
              { icon: CalendarClock, label: "Deadline", value: brief.deadline ? shortDate(brief.deadline) : "Rolling", note: deadline?.tone !== "neutral" ? deadline?.text : undefined },
              { icon: Users, label: "Creators needed", value: brief.creatorsNeeded },
              { icon: Users, label: "Applicants", value: brief._count.applications },
            ].map((f) => (
              <div key={f.label} className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <f.icon className="size-3.5" />
                  {f.label}
                </div>
                <div className="mt-1.5 font-display text-lg font-bold tabular-nums">{f.value}</div>
                {f.note && <div className="text-xs font-medium text-warning">{f.note}</div>}
              </div>
            ))}
          </div>

          <Panel title={`What ${brief.brand.companyName} wants`}>
            <p className="whitespace-pre-line text-sm leading-relaxed">{brief.description}</p>
            <dl className="mt-5 grid gap-x-6 gap-y-3 border-t pt-5 sm:grid-cols-2">
              {requirements.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="mt-0.5 text-sm font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <div className="lg:hidden">{fit}</div>

          {activeApp ? (
            <Panel title="Your application" action={<StatusBadge status={activeApp.status} />}>
              <p className="text-sm text-muted-foreground">{STATUS_COPY[activeApp.status]}</p>
              <div className="mt-4 rounded-lg border bg-muted/40 p-4">
                <p className="whitespace-pre-line text-sm">{activeApp.pitch}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
                  <span>
                    Proposed <span className="font-medium text-foreground">{inr(activeApp.proposedRate)}</span>
                  </span>
                  <span>Match {activeApp.matchScore}/100</span>
                  <span>Sent {timeAgo(activeApp.createdAt)}</span>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {activeApp.status === "OFFERED" && (
                  <Button asChild>
                    <Link href={offerDeal ? `/creator/deals/${offerDeal.id}` : "/creator/deals"}>
                      Review offer <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                )}
                {["APPLIED", "SHORTLISTED"].includes(activeApp.status) && <WithdrawButton applicationId={activeApp.id} briefTitle={brief.title} size="default" />}
                <Button variant="ghost" asChild>
                  <Link href="/creator/applications">All applications</Link>
                </Button>
              </div>
            </Panel>
          ) : closed ? (
            <Panel title="Applications closed">
              <p className="text-sm text-muted-foreground">This brief is no longer accepting applications. Similar briefs are posted regularly.</p>
              <Button variant="outline" className="mt-4" asChild>
                <Link href={brief.niche ? `/creator/marketplace?niche=${encodeURIComponent(brief.niche.toLowerCase())}` : "/creator/marketplace"}>Find similar briefs</Link>
              </Button>
            </Panel>
          ) : (
            <Panel
              title="Apply to this brief"
              description={
                application?.status === "WITHDRAWN"
                  ? "You withdrew earlier — you can re-apply while the brief is live."
                  : "Your pitch, match score and profile are shared with the brand."
              }
            >
              <ApplyForm briefId={brief.id} budget={brief.budgetPerCreator} brandName={brief.brand.companyName} />
              <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="size-3.5" /> If selected, the brand funds escrow before you start. You&apos;re never paid late or not at all.
              </p>
            </Panel>
          )}
        </div>

        <aside className="min-w-0 space-y-6">
          <div className="hidden lg:block">{fit}</div>
          <Panel title="About the brand">
            <div className="flex items-center gap-3">
              <Avatar name={brief.brand.companyName} src={brief.brand.logoUrl} size={44} />
              <div className="min-w-0">
                <div className="flex items-center gap-1 font-semibold">
                  <span className="truncate">{brief.brand.companyName}</span>
                  {brief.brand.verified && <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Verified brand" />}
                </div>
                <div className="truncate text-xs text-muted-foreground">{[brief.brand.industry, brief.brand.location, brief.brand.size].filter(Boolean).join(" · ") || "Brand on hustl."}</div>
              </div>
            </div>
            {brief.brand.description && <p className="mt-3 line-clamp-4 text-sm text-muted-foreground">{brief.brand.description}</p>}
            <div className="mt-4 grid grid-cols-2 divide-x rounded-lg border text-center">
              <div className="p-3">
                <div className="font-display font-bold tabular-nums">{brandCompleted}</div>
                <div className="text-[11px] text-muted-foreground">Deals completed</div>
              </div>
              <div className="p-3">
                <div className="font-display font-bold tabular-nums">{brandLive}</div>
                <div className="text-[11px] text-muted-foreground">Live briefs</div>
              </div>
            </div>
            {!brief.brand.verified && <p className="mt-3 text-xs text-muted-foreground">This brand isn&apos;t verified yet. Escrow still protects your payment on any deal.</p>}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
              <TextLink href={`/brands/${brief.brand.slug}`}>View brand profile →</TextLink>
              {brief.brand.website && (
                <a
                  href={/^https?:\/\//.test(brief.brand.website) ? brief.brand.website : `https://${brief.brand.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Globe className="size-3.5" /> Website
                </a>
              )}
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  )
}
