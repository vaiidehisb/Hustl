import Link from "next/link"
import { ExternalLink, Scale, ShieldAlert, ShieldCheck, TrendingUp, Users, Wallet } from "lucide-react"
import { db, json } from "@/lib/db"
import { requireAdmin } from "@/lib/session"
import { compact, inr, pct, timeAgo } from "@/lib/format"
import { Avatar, EmptyState, PageHeader, Panel, Pill, ScoreRing, StatCard } from "@/components/app/ui"
import type { FraudFlag } from "@/lib/ai/scoring"
import { ClearFlagsButton, ResolveDispute } from "./_components/admin-actions"

export default async function AdminPage() {
  await requireAdmin()
  const [disputes, flagged, txns, activeDeals, creators, brands] = await Promise.all([
    db.dispute.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "asc" },
      include: {
        raisedBy: { select: { name: true } },
        deal: {
          include: {
            brand: { select: { companyName: true } },
            creator: { select: { handle: true, user: { select: { name: true } } } },
            milestones: true,
            messages: { orderBy: { createdAt: "desc" }, take: 4, include: { sender: { select: { name: true } } } },
          },
        },
      },
    }),
    db.creatorProfile.findMany({
      where: { authenticityScore: { lt: 60 } },
      include: { user: { select: { name: true, image: true } } },
      orderBy: { authenticityScore: "asc" },
    }),
    db.transaction.groupBy({ by: ["type"], _sum: { amount: true } }),
    db.deal.count({ where: { status: { in: ["FUNDED", "IN_PROGRESS", "DISPUTED"] } } }),
    db.creatorProfile.count(),
    db.brandProfile.count(),
  ])
  const t = (type: string) => txns.find((x) => x.type === type)?._sum.amount ?? 0
  const gmv = t("ESCROW_FUND")
  const revenue = t("BRAND_FEE") + t("CREATOR_FEE")

  return (
    <div className="space-y-8">
      <PageHeader title="Trust & safety" description="Resolve disputes, review flagged creators and watch marketplace health." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="GMV through escrow" value={inr(gmv)} icon={Wallet} />
        <StatCard label="Platform revenue" value={inr(revenue)} hint={gmv ? `${pct(revenue / gmv)} take rate` : undefined} icon={TrendingUp} />
        <StatCard label="Active funded deals" value={activeDeals} icon={ShieldCheck} />
        <StatCard label="Marketplace" value={`${creators} / ${brands}`} hint="creators / brands" icon={Users} />
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <Scale className="size-4" /> Open disputes <Pill tone={disputes.length ? "danger" : "neutral"}>{disputes.length}</Pill>
        </h2>
        {disputes.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No open disputes" description="Everything is flowing. New disputes appear here with the full deal context." />
        ) : (
          <div className="space-y-4">
            {disputes.map((d) => {
              const m = d.deal.milestones.find((x) => x.id === d.milestoneId)
              return (
                <Panel
                  key={d.id}
                  title={d.deal.title}
                  description={`${d.deal.brand.companyName} × ${d.deal.creator.user.name} (@${d.deal.creator.handle}) · raised by ${d.raisedBy.name} ${timeAgo(d.createdAt)}`}
                  action={<Pill tone="danger">{m ? `${m.title} · ${inr(m.amount)}` : inr(d.deal.amount)}</Pill>}
                >
                  <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
                    <div className="space-y-4 text-sm">
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Reason</div>
                        <p className="mt-1">{d.reason}</p>
                      </div>
                      {m?.submissionUrl && (
                        <div>
                          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Submission</div>
                          <a href={m.submissionUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-primary hover:underline">
                            {m.submissionUrl} <ExternalLink className="size-3.5" />
                          </a>
                          {m.submissionNote && <p className="text-muted-foreground">{m.submissionNote}</p>}
                        </div>
                      )}
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Recent messages</div>
                        <ul className="mt-1 space-y-1.5">
                          {d.deal.messages.map((msg) => (
                            <li key={msg.id} className="rounded-md bg-muted/60 px-3 py-2">
                              <span className="font-medium">{msg.sender.name}:</span> {msg.body}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <ResolveDispute disputeId={d.id} />
                  </div>
                </Panel>
              )
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <ShieldAlert className="size-4" /> Authenticity review queue <Pill tone={flagged.length ? "warning" : "neutral"}>{flagged.length}</Pill>
        </h2>
        {flagged.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="Queue is clear" description="Creators with an authenticity score under 60 land here automatically." />
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            {flagged.map((c) => (
              <div key={c.id} className="flex flex-col gap-4 border-b p-5 last:border-0 md:flex-row md:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={c.user.name} src={c.avatarUrl ?? c.user.image} />
                  <div className="min-w-0">
                    <Link href={`/creators/${c.handle}`} className="font-medium hover:underline">
                      {c.user.name} <span className="font-normal text-muted-foreground">@{c.handle}</span>
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {compact(c.followers)} followers · {pct(c.engagementRate)} ER · +{pct(c.followerGrowth30d, 0)} in 30d
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {json<FraudFlag[]>(c.fraudFlags, []).map((f) => (
                        <Pill key={f.code} tone={f.severity === "high" ? "danger" : "warning"}>
                          {f.label}
                        </Pill>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <ScoreRing score={c.authenticityScore} label="Authenticity" />
                  <ClearFlagsButton creatorId={c.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
