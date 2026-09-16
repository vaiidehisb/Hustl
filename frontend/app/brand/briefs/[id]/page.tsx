import Link from "next/link"
import { notFound } from "next/navigation"
import { AlertTriangle, ArrowRight, CalendarClock, Check, Inbox, MapPin, Pencil, Sparkles, Target, Users, Wallet } from "lucide-react"
import type { ApplicationStatus } from "@hustl/contracts"
import { Button } from "@/components/ui/button"
import { Avatar, EmptyState, PageHeader, Panel, Pill, ScoreRing, TextLink } from "@/components/app/ui"
import { LinkTabs } from "@/components/brand/link-tabs"
import { MatchRow } from "@/components/brand/match-row"
import { OfferDialog } from "@/components/brand/offer-dialog"
import { ApplicationStatusButtons, BriefStatusActions } from "@/components/brand/brief-actions"
import { BrandStatusBadge } from "@/components/brand/status"
import { AiErrorPanel, ErrorPanel } from "@/components/brand/error-panel"
import { loadApplications, loadBrief, loadMatches, loadMe } from "@/components/brand/data"
import { cap, platformLabel } from "@/components/brand/helpers"
import { compact, inr, pct, shortDate, timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"

const COLUMNS: { status: ApplicationStatus; title: string; empty: string }[] = [
  { status: "APPLIED", title: "Applied", empty: "New applications land here." },
  { status: "SHORTLISTED", title: "Shortlisted", empty: "Shortlist creators you like." },
  { status: "OFFERED", title: "Offered", empty: "Send an offer to move a creator here." },
  { status: "REJECTED", title: "Not selected", empty: "Nobody passed on yet." },
]

export const metadata = { title: "Brief" }

export default async function BriefDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, { tab: rawTab }] = await Promise.all([params, searchParams])
  const tab = rawTab === "matches" || rawTab === "details" ? rawTab : "applications"

  const [briefRes, appsRes, meRes, matchesRes] = await Promise.all([
    loadBrief(id),
    loadApplications(id),
    loadMe(),
    tab === "matches" ? loadMatches(id, 20) : null,
  ])

  if (!briefRes.ok) {
    if (briefRes.error.status === 404) notFound()
    return (
      <div>
        <PageHeader title="Brief" />
        <ErrorPanel error={briefRes.error} title="Couldn't load this brief" />
      </div>
    )
  }

  const brief = briefRes.data
  const apps = appsRes.ok ? appsRes.data.filter((a) => a.status !== "WITHDRAWN") : []
  const plan = meRes.ok ? (meRes.data.brand?.plan ?? "STARTER") : "STARTER"
  const kycVerified = meRes.ok && meRes.data.user.kycStatus === "VERIFIED"
  const offerBrief = { id: brief.id, title: brief.title, deliverables: brief.deliverables, budgetPerCreator: brief.budgetPerCreator }
  const base = `/brand/briefs/${brief.id}`

  return (
    <div>
      <PageHeader
        eyebrow={
          <TextLink href="/brand/briefs" className="text-xs normal-case tracking-normal">
            ← Briefs
          </TextLink>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {brief.title} <BrandStatusBadge status={brief.status} className="text-xs" />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <Target className="size-3.5" /> {brief.niche ? cap(brief.niche) : "Any niche"}
              {brief.platforms.length > 0 && ` · ${brief.platforms.map(platformLabel).join(", ")}`}
            </span>
            <span className="inline-flex items-center gap-1">
              <Wallet className="size-3.5" /> {brief.budgetPerCreator ? `${inr(brief.budgetPerCreator)} / creator` : "Budget not set"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" /> {brief.creatorsNeeded} creator{brief.creatorsNeeded === 1 ? "" : "s"} needed
            </span>
            {brief.deadline && (
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-3.5" /> Apply by {shortDate(brief.deadline)}
              </span>
            )}
          </span>
        }
        actions={
          <>
            <Button variant="ghost" asChild>
              <Link href={`${base}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
            <BriefStatusActions briefId={brief.id} status={brief.status} />
          </>
        }
      />

      {brief.status === "DRAFT" && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          This brief is a draft — creators can't see or apply to it until you publish. You can still send direct offers to AI matches.
        </div>
      )}

      <LinkTabs
        className="mb-6"
        active={tab}
        tabs={[
          { value: "applications", label: "Applications", count: apps.length, href: base },
          { value: "matches", label: "AI matches", href: `${base}?tab=matches` },
          { value: "details", label: "Details", href: `${base}?tab=details` },
        ]}
      />

      {tab === "applications" &&
        (!appsRes.ok ? (
          <ErrorPanel error={appsRes.error} title="Couldn't load applications" />
        ) : apps.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No applications yet"
            description={brief.status === "PUBLISHED" ? "Matched creators are being notified. Meanwhile, invite top AI matches directly." : "Publish the brief so creators can apply."}
            action={
              <Button asChild>
                <Link href={`${base}?tab=matches`}>
                  <Sparkles /> View AI matches
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {COLUMNS.map((col) => {
                const items = apps.filter((a) => a.status === col.status)
                return (
                  <section key={col.status} className="flex min-w-0 flex-col rounded-xl bg-muted/40 p-2">
                    <header className="flex items-center justify-between px-2 py-1.5">
                      <h3 className="text-sm font-semibold">{col.title}</h3>
                      <span className="rounded-full bg-background px-2 text-xs tabular-nums text-muted-foreground">{items.length}</span>
                    </header>
                    <div className="flex flex-col gap-2">
                      {items.length === 0 && <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">{col.empty}</p>}
                      {items.map((a) => {
                        const c = a.creator
                        const name = c?.name ?? "Creator"
                        return (
                          <article key={a.id} className={cn("rounded-lg border bg-card p-3 shadow-xs", a.status === "REJECTED" && "opacity-70")}>
                            <div className="flex items-start gap-2.5">
                              <Avatar name={name} src={c?.avatarUrl} size={36} />
                              <div className="min-w-0 flex-1">
                                {c ? (
                                  <Link href={`/creators/${c.handle}`} className="block truncate text-sm font-medium hover:underline">
                                    {name}
                                  </Link>
                                ) : (
                                  <span className="block truncate text-sm font-medium">{name}</span>
                                )}
                                <p className="truncate text-xs text-muted-foreground">
                                  {c ? compact(c.followersTotal) : "—"}
                                  {c?.engagementRate !== null && c?.engagementRate !== undefined ? ` · ${pct(c.engagementRate)} ER` : ""}
                                  {c?.trustScore !== null && c?.trustScore !== undefined ? ` · trust ${c.trustScore}` : ""}
                                </p>
                              </div>
                              {a.matchScore !== null && <ScoreRing score={Math.round(a.matchScore)} size={38} />}
                            </div>
                            {a.disqualifiers.length > 0 && (
                              <div className="mt-2 space-y-1 rounded-md bg-warning-soft px-2 py-1.5">
                                {a.disqualifiers.map((d) => (
                                  <p key={d} className="flex items-start gap-1 text-[11px] font-medium text-warning">
                                    <AlertTriangle className="mt-px size-3 shrink-0" /> {d}
                                  </p>
                                ))}
                              </div>
                            )}
                            {a.matchReasons.length > 0 && (
                              <ul className="mt-2 space-y-0.5">
                                {a.matchReasons.slice(0, 3).map((r) => (
                                  <li key={r} className="flex items-start gap-1 text-[11px] text-muted-foreground">
                                    <Check className="mt-px size-3 shrink-0 text-success" /> {r}
                                  </li>
                                ))}
                              </ul>
                            )}
                            <p className="mt-2 line-clamp-3 text-xs leading-relaxed">&ldquo;{a.pitch}&rdquo;</p>
                            <div className="mt-2 flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">{timeAgo(a.createdAt)}</span>
                              <span>
                                asks{" "}
                                <span className={cn("font-semibold tabular-nums", brief.budgetPerCreator && a.proposedRate > brief.budgetPerCreator && "text-warning")}>
                                  {inr(a.proposedRate)}
                                </span>
                              </span>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5 border-t pt-2.5">
                              {a.status === "OFFERED" ? (
                                a.dealId ? (
                                  <Button size="sm" variant="outline" asChild>
                                    <Link href={`/brand/deals/${a.dealId}`}>
                                      View deal <ArrowRight className="size-3.5" />
                                    </Link>
                                  </Button>
                                ) : (
                                  <Pill tone="success">Offer sent</Pill>
                                )
                              ) : (
                                <>
                                  <ApplicationStatusButtons applicationId={a.id} status={a.status} name={name} />
                                  {a.status !== "REJECTED" && c && (
                                    <OfferDialog
                                      creator={{ id: c.id, name, handle: c.handle, avatarUrl: c.avatarUrl, reliabilityScore: c.reliabilityScore }}
                                      brief={offerBrief}
                                      applicationId={a.id}
                                      amount={a.proposedRate}
                                      brandPlan={plan}
                                      kycVerified={kycVerified}
                                      label="Offer"
                                    />
                                  )}
                                </>
                              )}
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </section>
                )
              })}
            </div>
          </div>
        ))}

      {tab === "matches" && (
        <Panel
          title={
            <span className="flex items-center gap-1.5">
              <Sparkles className="size-4 text-primary" /> AI matches for this brief
            </span>
          }
          description="Scored by the hustl. matching model against this brief. Creators who already applied are ranked here too."
          bodyClassName="py-0"
        >
          {matchesRes && !matchesRes.ok ? (
            <div className="py-5">
              <AiErrorPanel error={matchesRes.error} />
            </div>
          ) : !matchesRes?.ok || matchesRes.data.matches.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No creators matched this brief yet.</p>
          ) : (
            <div className="divide-y">
              {matchesRes.data.matches.map((m) => (
                <MatchRow key={m.creator.id} match={m} brief={offerBrief} brandPlan={plan} kycVerified={kycVerified} />
              ))}
            </div>
          )}
        </Panel>
      )}

      {tab === "details" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Panel title="Description" className="lg:col-span-2">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{brief.description}</p>
            {brief.requirements && (
              <>
                <h3 className="mt-6 mb-2 text-sm font-semibold">Requirements</h3>
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">{brief.requirements}</p>
              </>
            )}
            {brief.deliverables.length > 0 && (
              <>
                <h3 className="mt-6 mb-2 text-sm font-semibold">Deliverables</h3>
                <div className="flex flex-wrap gap-2">
                  {brief.deliverables.map((d, i) => (
                    <Pill key={i} tone="brand">
                      {d.quantity} × {d.type}
                    </Pill>
                  ))}
                </div>
              </>
            )}
          </Panel>
          <Panel title="Requirements">
            <dl className="space-y-3 text-sm">
              <Detail label="Niche" value={brief.niche ? cap(brief.niche) : "Any"} />
              <Detail label="Platforms" value={brief.platforms.length ? brief.platforms.map(platformLabel).join(", ") : "Any"} />
              <Detail label="Min. followers" value={brief.minFollowers ? compact(brief.minFollowers) : "Any"} />
              <Detail label="Min. engagement" value={brief.minEngagement ? pct(brief.minEngagement) : "Any"} />
              <Detail label="Budget / creator" value={brief.budgetPerCreator ? inr(brief.budgetPerCreator) : "—"} />
              <Detail label="Creators needed" value={String(brief.creatorsNeeded)} />
              <Detail
                label="Locations"
                value={
                  brief.locations.length ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3" />
                      {brief.locations.join(", ")}
                    </span>
                  ) : (
                    "Anywhere"
                  )
                }
              />
              <Detail label="Timeline" value={brief.timeline || "—"} />
              <Detail label="Audience" value={brief.audience || "—"} />
              <Detail label="Visibility" value={brief.visibility === "OPEN" ? "Open marketplace" : "Direct invites only"} />
              <Detail label="Deadline" value={shortDate(brief.deadline)} />
              <Detail label="Created" value={shortDate(brief.createdAt)} />
            </dl>
          </Panel>
        </div>
      )}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  )
}
