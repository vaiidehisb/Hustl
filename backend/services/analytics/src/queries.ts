// Aggregations over PostgreSQL. All money is whole INR; month buckets are UTC.

import { prisma, Prisma, type DealStatus, type LedgerEntryType } from "@hustl/db"
import { DEAL_STATUSES } from "@hustl/contracts"
import type {
  AdminMetrics,
  BrandOverview,
  CampaignAnalytics,
  CreatorOverview,
  DealAnalytics,
  DealReport,
  DealStageDuration,
  MonthlyPoint,
} from "@hustl/contracts"

export type Range = { from?: Date; to?: Date }

const SPEND_TYPES: LedgerEntryType[] = ["ESCROW_FUND", "BRAND_FEE", "PROCESSING_FEE"]
const ACTIVE_DEAL_STATUSES: DealStatus[] = ["FUNDED", "IN_PROGRESS", "DISPUTED"]
const TERMINAL: DealStatus[] = ["COMPLETED", "CANCELLED"]
const HOUR_MS = 3_600_000

const dateFilter = (r: Range) => (r.from || r.to ? { ...(r.from && { gte: r.from }), ...(r.to && { lte: r.to }) } : undefined)
const rangeDto = (r: Range) => ({ from: r.from?.toISOString() ?? null, to: r.to?.toISOString() ?? null })
const round2 = (n: number) => Math.round(n * 100) / 100
const ratio = (num: number, den: number) => (den > 0 ? num / den : null)

/** SQL fragment `AND <col> >= from AND <col> <= to` for optional bounds. */
const sqlRange = (column: Prisma.Sql, r: Range) =>
  Prisma.sql`${r.from ? Prisma.sql`AND ${column} >= ${r.from}` : Prisma.empty} ${r.to ? Prisma.sql`AND ${column} <= ${r.to}` : Prisma.empty}`

function zeroStatuses(): Record<DealStatus, number> {
  return Object.fromEntries(DEAL_STATUSES.map((s) => [s, 0])) as Record<DealStatus, number>
}

async function ledgerTotals(where: Prisma.LedgerEntryWhereInput) {
  const rows = await prisma.ledgerEntry.groupBy({ by: ["type"], where, _sum: { amount: true } })
  const sum = Object.fromEntries(rows.map((r) => [r.type, r._sum.amount ?? 0])) as Partial<Record<LedgerEntryType, number>>
  return (t: LedgerEntryType) => sum[t] ?? 0
}

/** Last 12 months (UTC) zero-filled, oldest first. `inner` must select (bucket timestamp, amount). */
async function monthlySeries(inner: Prisma.Sql): Promise<MonthlyPoint[]> {
  const rows = await prisma.$queryRaw<{ month: string; amount: bigint | number }[]>`
    WITH months AS (
      SELECT generate_series(
        date_trunc('month', now() AT TIME ZONE 'UTC') - interval '11 months',
        date_trunc('month', now() AT TIME ZONE 'UTC'),
        interval '1 month'
      ) AS m
    ), src AS (${inner})
    SELECT to_char(months.m, 'YYYY-MM') AS month, COALESCE(SUM(src.amount), 0)::bigint AS amount
    FROM months LEFT JOIN src ON date_trunc('month', src.at) = months.m
    GROUP BY months.m ORDER BY months.m`
  return rows.map((r) => ({ month: r.month, amount: Number(r.amount) }))
}

// ─── Brand ───────────────────────────────────────────────────────────────────

export async function brandOverview(brandId: string, r: Range): Promise<BrandOverview> {
  const created = dateFilter(r)
  const [ledger, escrow, statusRows, fundRows, monthlySpend, activeBriefs] = await Promise.all([
    ledgerTotals({ deal: { brandId }, type: { in: SPEND_TYPES }, ...(created && { createdAt: created }) }),
    prisma.escrowAccount.aggregate({ where: { deal: { brandId } }, _sum: { fundedAmount: true, releasedAmount: true, refundedAmount: true } }),
    prisma.deal.groupBy({ by: ["status"], where: { brandId, ...(created && { createdAt: created }) }, _count: { _all: true } }),
    prisma.$queryRaw<{ hours: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM (f.funded_at - d.created_at)) / 3600)::float8 AS hours
      FROM deals d
      JOIN LATERAL (
        SELECT MIN(e.created_at) AS funded_at FROM deal_events e WHERE e.deal_id = d.id AND e.to_status = 'FUNDED'
      ) f ON f.funded_at IS NOT NULL
      WHERE d.brand_id = ${brandId}::uuid ${sqlRange(Prisma.sql`d.created_at`, r)}`,
    monthlySeries(Prisma.sql`
      SELECT l.created_at AS at, l.amount FROM ledger_entries l JOIN deals d ON d.id = l.deal_id
      WHERE d.brand_id = ${brandId}::uuid AND l.type IN ('ESCROW_FUND', 'BRAND_FEE', 'PROCESSING_FEE')`),
    prisma.brief.count({ where: { brandId, status: "PUBLISHED", deletedAt: null } }),
  ])
  const dealsByStatus = zeroStatuses()
  for (const row of statusRows) dealsByStatus[row.status] = row._count._all
  const s = escrow._sum
  const spendBreakdown = { escrowFunded: ledger("ESCROW_FUND"), brandFees: ledger("BRAND_FEE"), processingFees: ledger("PROCESSING_FEE") }
  return {
    brandId,
    range: rangeDto(r),
    totalSpend: spendBreakdown.escrowFunded + spendBreakdown.brandFees + spendBreakdown.processingFees,
    spendBreakdown,
    escrowHeld: (s.fundedAmount ?? 0) - (s.releasedAmount ?? 0) - (s.refundedAmount ?? 0),
    dealsByStatus,
    totalDeals: Object.values(dealsByStatus).reduce((a, b) => a + b, 0),
    avgHoursToFund: fundRows[0]?.hours == null ? null : round2(fundRows[0].hours),
    monthlySpend,
    activeBriefs,
  }
}

export async function brandCampaigns(brandId: string, r: Range, page: { page: number; pageSize: number }) {
  const where = { brandId, deletedAt: null, ...(dateFilter(r) && { createdAt: dateFilter(r) }) }
  const [rows, total] = await Promise.all([
    prisma.$queryRaw<
      {
        id: string
        title: string
        status: CampaignAnalytics["status"]
        published_at: Date | null
        applications: number
        shortlisted: number
        offers: number
        deals: number
        spend: bigint
        avg_match_score: number | null
      }[]
    >`
      SELECT b.id, b.title, b.status::text AS status, b.published_at,
        (SELECT COUNT(*) FROM applications a WHERE a.brief_id = b.id)::int AS applications,
        (SELECT COUNT(*) FROM applications a WHERE a.brief_id = b.id AND a.status IN ('SHORTLISTED', 'OFFERED'))::int AS shortlisted,
        (SELECT COUNT(*) FROM deals d WHERE d.brief_id = b.id)::int AS offers,
        (SELECT COUNT(*) FROM deals d WHERE d.brief_id = b.id
           AND d.status IN ('AGREED', 'CONTRACT_SIGNED', 'FUNDED', 'IN_PROGRESS', 'COMPLETED', 'DISPUTED'))::int AS deals,
        (SELECT COALESCE(SUM(l.amount), 0) FROM ledger_entries l JOIN deals d ON d.id = l.deal_id
           WHERE d.brief_id = b.id AND l.type IN ('ESCROW_FUND', 'BRAND_FEE', 'PROCESSING_FEE'))::bigint AS spend,
        (SELECT AVG(a.match_score) FROM applications a WHERE a.brief_id = b.id AND a.match_score IS NOT NULL)::float8 AS avg_match_score
      FROM briefs b
      WHERE b.brand_id = ${brandId}::uuid AND b.deleted_at IS NULL ${sqlRange(Prisma.sql`b.created_at`, r)}
      ORDER BY b.created_at DESC, b.id
      LIMIT ${page.pageSize} OFFSET ${(page.page - 1) * page.pageSize}`,
    prisma.brief.count({ where }),
  ])
  const items: CampaignAnalytics[] = rows.map((b) => ({
    briefId: b.id,
    title: b.title,
    status: b.status,
    publishedAt: b.published_at?.toISOString() ?? null,
    applications: b.applications,
    shortlisted: b.shortlisted,
    offers: b.offers,
    deals: b.deals,
    spend: Number(b.spend),
    avgMatchScore: b.avg_match_score == null ? null : round2(b.avg_match_score),
  }))
  return { items, total }
}

// ─── Creator ─────────────────────────────────────────────────────────────────

export async function creatorOverview(creator: { id: string; userId: string }, r: Range): Promise<CreatorOverview> {
  const range = dateFilter(r)
  const creatorId = creator.id
  const [paid, monthlyEarnings, pendingPayouts, approved, escrow, apps, delivery, rating, completedDeals, activeDeals, score] = await Promise.all([
    prisma.payout.aggregate({ where: { creatorId, status: "PAID", ...(range && { paidAt: range }) }, _sum: { net: true } }),
    monthlySeries(Prisma.sql`SELECT p.paid_at AS at, p.net AS amount FROM payouts p WHERE p.creator_id = ${creatorId}::uuid AND p.status = 'PAID' AND p.paid_at IS NOT NULL`),
    prisma.payout.aggregate({ where: { creatorId, status: { in: ["PENDING", "ON_HOLD"] } }, _sum: { net: true } }),
    prisma.milestone.aggregate({ where: { deal: { creatorId }, status: "APPROVED" }, _sum: { amount: true } }),
    prisma.escrowAccount.aggregate({ where: { deal: { creatorId } }, _sum: { fundedAmount: true, releasedAmount: true, refundedAmount: true } }),
    prisma.application.groupBy({ by: ["status"], where: { creatorId, ...(range && { createdAt: range }) }, _count: { _all: true } }),
    prisma.$queryRaw<{ submitted: number; with_due: number; on_time: number; revised: number }[]>`
      SELECT
        COUNT(*)::int AS submitted,
        COUNT(*) FILTER (WHERE m.due_date IS NOT NULL)::int AS with_due,
        COUNT(*) FILTER (WHERE m.due_date IS NOT NULL AND s.first_at <= m.due_date)::int AS on_time,
        COUNT(*) FILTER (WHERE m.revision_count > 0)::int AS revised
      FROM milestones m
      JOIN deals d ON d.id = m.deal_id
      JOIN LATERAL (
        SELECT COALESCE((SELECT MIN(dl.created_at) FROM deliverables dl WHERE dl.milestone_id = m.id), m.submitted_at) AS first_at
      ) s ON s.first_at IS NOT NULL
      WHERE d.creator_id = ${creatorId}::uuid ${sqlRange(Prisma.sql`s.first_at`, r)}`,
    prisma.review.aggregate({ where: { subjectUserId: creator.userId, ...(range && { createdAt: range }) }, _avg: { rating: true }, _count: { _all: true } }),
    prisma.deal.count({ where: { creatorId, status: "COMPLETED", ...(range && { completedAt: range }) } }),
    prisma.deal.count({ where: { creatorId, status: { in: ACTIVE_DEAL_STATUSES } } }),
    prisma.creatorScore.findUnique({ where: { creatorId } }),
  ])
  const byStatus = Object.fromEntries(apps.map((a) => [a.status, a._count._all])) as Record<string, number>
  const appTotal = Object.entries(byStatus).reduce((s, [k, v]) => (k === "WITHDRAWN" ? s : s + v), 0)
  const offered = byStatus.OFFERED ?? 0
  const d = delivery[0] ?? { submitted: 0, with_due: 0, on_time: 0, revised: 0 }
  const e = escrow._sum
  const inEscrow = (e.fundedAmount ?? 0) - (e.releasedAmount ?? 0) - (e.refundedAmount ?? 0)
  const payoutsPending = pendingPayouts._sum.net ?? 0
  return {
    creatorId,
    range: rangeDto(r),
    totalEarned: paid._sum.net ?? 0,
    monthlyEarnings,
    pending: { payoutsPending, approvedAwaitingRelease: approved._sum.amount ?? 0, inEscrow, total: payoutsPending + inEscrow },
    applications: { total: appTotal, offered, winRate: ratio(offered, appTotal) },
    onTimeRate: ratio(d.on_time, d.with_due),
    revisionRate: ratio(d.revised, d.submitted),
    avgRating: rating._avg.rating == null ? null : round2(rating._avg.rating),
    reviewCount: rating._count._all,
    completedDeals,
    activeDeals,
    scores: score
      ? {
          trustScore: score.trustScore,
          nicheAuthority: score.nicheAuthority,
          reliabilityScore: score.reliabilityScore,
          authenticityScore: score.authenticityScore,
          modelVersion: score.modelVersion,
          computedAt: score.computedAt.toISOString(),
        }
      : null,
  }
}

// ─── Deals ───────────────────────────────────────────────────────────────────

export const dealInclude = {
  brand: { select: { id: true, userId: true, companyName: true } },
  creator: { select: { id: true, userId: true, handle: true, user: { select: { name: true } } } },
  milestones: { orderBy: { position: "asc" }, include: { submissions: { orderBy: { createdAt: "asc" }, take: 1, select: { createdAt: true } } } },
  events: { orderBy: { createdAt: "asc" }, select: { toStatus: true, createdAt: true } },
} satisfies Prisma.DealInclude

export type DealRow = Prisma.DealGetPayload<{ include: typeof dealInclude }>

export const loadDeal = (id: string) => prisma.deal.findUnique({ where: { id }, include: dealInclude })

export function stageDurations(
  deal: { createdAt: Date; status: DealStatus },
  events: { toStatus: DealStatus | null; createdAt: Date }[],
  now = new Date(),
): DealStageDuration[] {
  const transitions = events.filter((e) => e.toStatus).map((e) => ({ status: e.toStatus!, at: e.createdAt }))
  if (!transitions.length || transitions[0].status !== "OFFER_SENT") transitions.unshift({ status: "OFFER_SENT", at: deal.createdAt })
  return transitions.map((t, i) => {
    const next = transitions[i + 1]
    const terminal = !next && TERMINAL.includes(t.status)
    const exitedAt = next?.at ?? null
    const end = exitedAt ?? (terminal ? t.at : now)
    return {
      status: t.status,
      enteredAt: t.at.toISOString(),
      exitedAt: exitedAt?.toISOString() ?? null,
      durationHours: round2(Math.max(0, end.getTime() - t.at.getTime()) / HOUR_MS),
    }
  })
}

export async function dealAnalytics(deal: DealRow, now = new Date()): Promise<DealAnalytics> {
  const ledger = await ledgerTotals({ dealId: deal.id })
  const milestones = deal.milestones.map((m) => {
    const firstSubmittedAt = m.submissions[0]?.createdAt ?? m.submittedAt
    return {
      id: m.id,
      position: m.position,
      title: m.title,
      amount: m.amount,
      status: m.status,
      dueDate: m.dueDate?.toISOString() ?? null,
      firstSubmittedAt: firstSubmittedAt?.toISOString() ?? null,
      approvedAt: m.approvedAt?.toISOString() ?? null,
      releasedAt: m.releasedAt?.toISOString() ?? null,
      revisionCount: m.revisionCount,
      onTime: m.dueDate && firstSubmittedAt ? firstSubmittedAt.getTime() <= m.dueDate.getTime() : null,
    }
  })
  const judged = milestones.filter((m) => m.onTime !== null)
  const end = deal.completedAt ?? deal.cancelledAt ?? now
  return {
    dealId: deal.id,
    title: deal.title,
    status: deal.status,
    amount: deal.amount,
    currency: deal.currency,
    createdAt: deal.createdAt.toISOString(),
    completedAt: deal.completedAt?.toISOString() ?? null,
    totalHours: round2((end.getTime() - deal.createdAt.getTime()) / HOUR_MS),
    stages: stageDurations(deal, deal.events, now),
    milestones,
    milestoneOnTimeRate: ratio(judged.filter((m) => m.onTime).length, judged.length),
    money: {
      escrowFunded: ledger("ESCROW_FUND"),
      brandFees: ledger("BRAND_FEE"),
      processingFees: ledger("PROCESSING_FEE"),
      released: ledger("RELEASE"),
      creatorFees: ledger("CREATOR_FEE"),
      refunded: ledger("REFUND"),
    },
  }
}

export async function dealReport(deal: DealRow): Promise<DealReport> {
  const [analytics, ledger, reviews] = await Promise.all([
    dealAnalytics(deal),
    prisma.ledgerEntry.findMany({ where: { dealId: deal.id }, orderBy: { createdAt: "asc" } }),
    prisma.review.findMany({ where: { dealId: deal.id }, orderBy: { createdAt: "asc" } }),
  ])
  return {
    ...analytics,
    brand: { id: deal.brand.id, name: deal.brand.companyName },
    creator: { id: deal.creator.id, handle: deal.creator.handle, name: deal.creator.user.name },
    paymentMode: deal.paymentMode,
    ledger: ledger.map((l) => ({ id: l.id, type: l.type, amount: l.amount, milestoneId: l.milestoneId, createdAt: l.createdAt.toISOString() })),
    reviews: reviews.map((rv) => ({
      rating: rv.rating,
      comment: rv.comment,
      authorRole: rv.authorId === deal.brand.userId ? ("BRAND" as const) : ("CREATOR" as const),
      createdAt: rv.createdAt.toISOString(),
    })),
  }
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function adminMetrics(r: Range): Promise<AdminMetrics> {
  const range = dateFilter(r)
  const [ledger, statusRows, activeDeals, roleRows, suspended, openDisputes, openFraudFlags] = await Promise.all([
    ledgerTotals({ type: { in: ["ESCROW_FUND", "BRAND_FEE", "CREATOR_FEE"] }, ...(range && { createdAt: range }) }),
    prisma.deal.groupBy({ by: ["status"], where: range ? { createdAt: range } : {}, _count: { _all: true } }),
    prisma.deal.count({ where: { status: { in: ACTIVE_DEAL_STATUSES } } }),
    prisma.user.groupBy({ by: ["role"], where: { deletedAt: null }, _count: { _all: true } }),
    prisma.user.count({ where: { deletedAt: null, status: "SUSPENDED" } }),
    prisma.dispute.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
    prisma.fraudFlag.count({ where: { status: "OPEN" } }),
  ])
  const dealsByStatus = zeroStatuses()
  for (const row of statusRows) dealsByStatus[row.status] = row._count._all
  const byRole = { BRAND: 0, CREATOR: 0, ADMIN: 0, UNASSIGNED: 0 }
  for (const row of roleRows) byRole[row.role ?? "UNASSIGNED"] = row._count._all
  const gmv = ledger("ESCROW_FUND")
  const revenueBreakdown = { brandFees: ledger("BRAND_FEE"), creatorFees: ledger("CREATOR_FEE") }
  const platformRevenue = revenueBreakdown.brandFees + revenueBreakdown.creatorFees
  const takeRate = ratio(platformRevenue, gmv)
  return {
    range: rangeDto(r),
    gmv,
    platformRevenue,
    revenueBreakdown,
    takeRate: takeRate == null ? null : Math.round(takeRate * 10_000) / 10_000,
    activeDeals,
    dealsByStatus,
    users: { total: Object.values(byRole).reduce((a, b) => a + b, 0), byRole, suspended },
    openDisputes,
    openFraudFlags,
  }
}
