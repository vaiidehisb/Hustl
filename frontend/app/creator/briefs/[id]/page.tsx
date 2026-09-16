import Link from "next/link"
import { notFound } from "next/navigation"
import { AlertTriangle, ArrowLeft, ArrowRight, BadgeCheck, CalendarClock, CheckCircle2, Clock3, Globe, IndianRupee, Lightbulb, Lock, Users } from "lucide-react"
import type { ApplicationDTO, BriefDTO } from "@hustl/contracts"
import { Button } from "@/components/ui/button"
import { Avatar, PageHeader, Panel, Pill, ScoreRing, StatusBadge, TextLink } from "@/components/app/ui"
import { ApplyForm } from "@/components/creator/apply-form"
import { WithdrawButton } from "@/components/creator/withdraw-button"
import { ErrorState } from "@/components/creator/states"
import { canWithdraw, deadlineLabel, nicheLabel, platformLabel } from "@/components/creator/lib"
import { compact, inr, pct, shortDate, timeAgo } from "@/lib/format"
import { getBrandProfile, getBrief, getBriefFit, getMyApplications, load, soft, type BriefFit } from "../../data"

export const metadata = { title: "Brief · hustl." }

const STATUS_COPY: Record<string, string> = {
  APPLIED: "The brand has your pitch. You'll be notified the moment they shortlist you, send an offer or close the brief.",
  SHORTLISTED: "You're on the shortlist — the brand is comparing a few creators. Keep notifications on so you can reply to an offer quickly.",
  OFFERED: "The brand sent you an offer. Review the terms, counter if needed, and sign — payment is locked in escrow before you start.",
  REJECTED: "The brand went with other creators this time. Use the fit insights to sharpen your next pitch.",
  WITHDRAWN: "You withdrew this application. You can apply again while the brief is live.",
}

function scoringState(application: ApplicationDTO) {
  if (application.matchScore !== null && application.scoredAt) return { key: "scored" as const, label: "Fit scored", copy: `Scored ${application.matchScore}/100 by our matching model when you applied.` }
  return {
    key: "queued" as const,
    label: "Fit score queued",
    copy: "This brief had a lot of applications, so scoring runs in the background. The brand sees your pitch either way — the score appears here once it lands.",
  }
}

function FitPanel({ fit, brief, unavailable }: { fit: BriefFit | null; brief: BriefDTO; unavailable: boolean }) {
  if (!fit) {
    return (
      <Panel title="Your fit" description="How our matching model sees you for this brief.">
        <p className="text-sm text-muted-foreground">
          {unavailable
            ? "The scoring service didn't respond just now, so we're not showing a number rather than guessing one. You can still apply — the brand sees your pitch and profile."
            : "No fit score for this brief yet."}
        </p>
      </Panel>
    )
  }
  const verdict = fit.disqualifiers.length > 0 ? "Some gaps to address" : fit.matchScore >= 80 ? "Excellent fit" : fit.matchScore >= 60 ? "Good fit" : fit.matchScore >= 40 ? "Partial fit" : "Long shot"
  return (
    <Panel title="Your fit" description="How our matching model sees you for this brief.">
      <div className="flex items-center gap-4">
        <ScoreRing score={fit.matchScore} size={72} />
        <div className="min-w-0">
          <div className="font-semibold">{verdict}</div>
          <p className="text-xs text-muted-foreground">
            Based on your niches, platforms, audience and reliability{fit.modelVersion ? ` · model ${fit.modelVersion}` : ""}.
          </p>
        </div>
      </div>
      {fit.matchReasons.length > 0 && (
        <ul className="mt-4 space-y-2">
          {fit.matchReasons.map((r) => (
            <li key={r} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
              {r}
            </li>
          ))}
        </ul>
      )}
      {fit.disqualifiers.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {fit.disqualifiers.map((d) => (
            <li key={d} className="flex items-start gap-2 rounded-md bg-warning-soft px-2.5 py-1.5 text-sm font-medium text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {d}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 border-t pt-4">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Lightbulb className="size-3.5" /> Make your pitch land
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>Open with a concrete content idea for {brief.brand?.companyName ?? "the brand"}, not your bio.</li>
          {brief.platforms.length > 0 && <li>Say which of {brief.platforms.map(platformLabel).join(" / ")} you&apos;d post on, and when.</li>}
          <li>
            Point to one similar piece of work and its result.{" "}
            <TextLink href="/creator/profile#portfolio">Add it to your portfolio →</TextLink>
          </li>
        </ul>
      </div>
    </Panel>
  )
}

export default async function BriefDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const briefResult = await load(() => getBrief(id))
  if (!briefResult.ok) {
    if (briefResult.error.status === 404) notFound()
    return (
      <div>
        <PageHeader title="Brief" />
        <ErrorState error={briefResult.error} />
      </div>
    )
  }
  const brief = briefResult.data

  const [fit, brand, mine] = await Promise.all([
    soft(() => getBriefFit(brief.id)),
    brief.brand ? soft(() => getBrandProfile(brief.brand!.slug)) : Promise.resolve(null),
    soft(() => getMyApplications({ pageSize: 100 })),
  ])
  const application = mine?.items.find((a) => a.briefId === brief.id) ?? null
  const activeApplication = application && application.status !== "WITHDRAWN" ? application : null

  const closed = brief.status !== "PUBLISHED" || (brief.deadline !== null && new Date(brief.deadline) < new Date())
  const deadline = deadlineLabel(brief.deadline)
  const scoring = activeApplication ? scoringState(activeApplication) : null

  const requirements: [string, React.ReactNode][] = [
    ["Deliverables", brief.deliverables.length ? brief.deliverables.map((d) => `${d.quantity} × ${d.type}`).join(", ") : "To be agreed"],
    ["Platforms", brief.platforms.length ? brief.platforms.map(platformLabel).join(", ") : "Any"],
    ["Niche", brief.niche ? nicheLabel(brief.niche) : "Open"],
    ["Min. followers", brief.minFollowers ? `${compact(brief.minFollowers)}+` : "No minimum"],
    ["Min. engagement", brief.minEngagement ? `${pct(brief.minEngagement)}+` : "No minimum"],
    ["Target audience", brief.audience || "—"],
    ["Location", brief.locations.length ? brief.locations.join(", ") : "Pan-India"],
    ["Timeline", brief.timeline || "Flexible"],
  ]

  const fitPanel = <FitPanel fit={fit} brief={brief} unavailable={!fit} />

  return (
    <div>
      <Link href="/creator/marketplace" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Marketplace
      </Link>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1 normal-case tracking-normal">
            {brief.brand?.companyName ?? "Brand on hustl."}
            {brief.brand?.verified && <BadgeCheck className="size-3.5 text-primary" />}
            {closed && (
              <Pill className="ml-2" tone="neutral">
                Closed
              </Pill>
            )}
          </span>
        }
        title={brief.title}
        description={`Posted ${timeAgo(brief.publishedAt ?? brief.createdAt)}`}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: IndianRupee, label: "Budget per creator", value: inr(brief.budgetPerCreator) },
              { icon: CalendarClock, label: "Deadline", value: brief.deadline ? shortDate(brief.deadline) : "Rolling", note: deadline?.tone !== "neutral" ? deadline?.text : undefined },
              { icon: Users, label: "Creators needed", value: brief.creatorsNeeded },
              { icon: Users, label: "Applicants", value: brief.applicationsCount ?? "—" },
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

          <Panel title={`What ${brief.brand?.companyName ?? "the brand"} wants`}>
            <p className="whitespace-pre-line text-sm leading-relaxed">{brief.description}</p>
            {brief.requirements && <p className="mt-4 whitespace-pre-line rounded-lg bg-muted/40 p-4 text-sm">{brief.requirements}</p>}
            <dl className="mt-5 grid gap-x-6 gap-y-3 border-t pt-5 sm:grid-cols-2">
              {requirements.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="mt-0.5 text-sm font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <div className="lg:hidden">{fitPanel}</div>

          {activeApplication ? (
            <Panel title="Your application" action={<StatusBadge status={activeApplication.status} />}>
              <p className="text-sm text-muted-foreground">{STATUS_COPY[activeApplication.status]}</p>
              <div className="mt-4 rounded-lg border bg-muted/40 p-4">
                <p className="whitespace-pre-line text-sm">{activeApplication.pitch}</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
                  <span>
                    Proposed <span className="font-medium text-foreground">{inr(activeApplication.proposedRate)}</span>
                  </span>
                  {scoring && (
                    <span className="inline-flex items-center gap-1">
                      {scoring.key === "scored" ? <CheckCircle2 className="size-3.5 text-success" /> : <Clock3 className="size-3.5 text-warning" />}
                      {scoring.label}
                    </span>
                  )}
                  <span>Sent {timeAgo(activeApplication.createdAt)}</span>
                </div>
                {scoring && <p className="mt-2 text-xs text-muted-foreground">{scoring.copy}</p>}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {activeApplication.status === "OFFERED" && (
                  <Button asChild>
                    <Link href={activeApplication.dealId ? `/creator/deals/${activeApplication.dealId}` : "/creator/deals"}>
                      Review offer <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                )}
                {canWithdraw(activeApplication.status) && <WithdrawButton applicationId={activeApplication.id} briefTitle={brief.title} size="default" />}
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
                application?.status === "WITHDRAWN" ? "You withdrew earlier — you can re-apply while the brief is live." : "Your pitch, fit score and profile are shared with the brand."
              }
            >
              <ApplyForm briefId={brief.id} budget={brief.budgetPerCreator} brandName={brief.brand?.companyName ?? "the brand"} />
              <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="size-3.5" /> If selected, the brand funds escrow before you start. You&apos;re never paid late or not at all.
              </p>
            </Panel>
          )}
        </div>

        <aside className="min-w-0 space-y-6">
          <div className="hidden lg:block">{fitPanel}</div>
          <Panel title="About the brand">
            <div className="flex items-center gap-3">
              <Avatar name={brief.brand?.companyName ?? "Brand"} src={brief.brand?.logoUrl} size={44} />
              <div className="min-w-0">
                <div className="flex items-center gap-1 font-semibold">
                  <span className="truncate">{brief.brand?.companyName ?? "Brand on hustl."}</span>
                  {brief.brand?.verified && <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Verified brand" />}
                </div>
                <div className="truncate text-xs text-muted-foreground">{[brand?.industry, brand?.location, brand?.size].filter(Boolean).join(" · ") || "Brand on hustl."}</div>
              </div>
            </div>
            {brand?.description && <p className="mt-3 line-clamp-4 text-sm text-muted-foreground">{brand.description}</p>}
            {brand && (
              <div className="mt-4 grid grid-cols-2 divide-x rounded-lg border text-center">
                <div className="p-3">
                  <div className="font-display font-bold tabular-nums">{brand.completedDeals}</div>
                  <div className="text-[11px] text-muted-foreground">Deals completed</div>
                </div>
                <div className="p-3">
                  <div className="font-display font-bold tabular-nums">{brand.openBriefs}</div>
                  <div className="text-[11px] text-muted-foreground">Live briefs</div>
                </div>
              </div>
            )}
            {brief.brand && !brief.brand.verified && <p className="mt-3 text-xs text-muted-foreground">This brand isn&apos;t verified yet. Escrow still protects your payment on any deal.</p>}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
              {brief.brand && <TextLink href={`/brands/${brief.brand.slug}`}>View brand profile →</TextLink>}
              {brand?.website && (
                <a
                  href={/^https?:\/\//.test(brand.website) ? brand.website : `https://${brand.website}`}
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
