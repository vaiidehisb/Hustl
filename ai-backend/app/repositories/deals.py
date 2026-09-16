"""Read-only delivery history (deals, milestones, reviews, disputes, offers, payments)."""

from __future__ import annotations

from typing import Any
from uuid import UUID

import asyncpg

FUNDED_STATUSES = ["FUNDED", "IN_PROGRESS", "COMPLETED", "DISPUTED"]


async def creator_delivery_stats(pool: asyncpg.Pool, creator_id: UUID, user_id: UUID) -> dict[str, Any]:
    async with pool.acquire() as conn:
        status_rows = await conn.fetch(
            "SELECT status::text AS status, count(*) AS n FROM deals WHERE creator_id = $1 GROUP BY 1", creator_id
        )
        milestones = await conn.fetchrow(
            """SELECT
                 count(*) FILTER (WHERE m.due_date IS NOT NULL AND m.submitted_at IS NOT NULL) AS due_submitted,
                 count(*) FILTER (WHERE m.due_date IS NOT NULL AND m.submitted_at IS NOT NULL
                                    AND m.submitted_at <= m.due_date) AS on_time,
                 count(*) FILTER (WHERE m.due_date IS NOT NULL AND m.submitted_at IS NULL
                                    AND m.due_date < (now() AT TIME ZONE 'utc')
                                    AND d.status::text IN ('FUNDED', 'IN_PROGRESS', 'DISPUTED')) AS overdue_unsubmitted,
                 count(*) FILTER (WHERE m.submitted_at IS NOT NULL) AS submitted,
                 COALESCE(sum(m.revision_count) FILTER (WHERE m.submitted_at IS NOT NULL), 0) AS revisions
               FROM milestones m JOIN deals d ON d.id = m.deal_id
               WHERE d.creator_id = $1""",
            creator_id,
        )
        reviews = await conn.fetchrow(
            """SELECT count(*) AS n, avg(r.rating)::float8 AS avg_rating
               FROM reviews r JOIN deals d ON d.id = r.deal_id
               WHERE r.subject_user_id = $1 AND r.author_id <> $1 AND d.creator_id = $2""",
            user_id, creator_id,
        )
        disputes = await conn.fetchrow(
            """SELECT count(*) AS n,
                      count(*) FILTER (WHERE ds.resolution::text = 'REFUND_TO_BRAND') AS lost
               FROM disputes ds JOIN deals d ON d.id = ds.deal_id WHERE d.creator_id = $1""",
            creator_id,
        )
        response = await conn.fetchrow(
            """SELECT count(*) AS n,
                      avg(extract(epoch FROM (o.responded_at - o.created_at)) / 3600.0)::float8 AS avg_hours
               FROM deal_offers o JOIN deals d ON d.id = o.deal_id
               WHERE d.creator_id = $1 AND o.proposed_by::text = 'BRAND' AND o.responded_at IS NOT NULL""",
            creator_id,
        )
        creator_cancellations = await conn.fetchval(
            """SELECT count(DISTINCT e.deal_id) FROM deal_events e JOIN deals d ON d.id = e.deal_id
               WHERE d.creator_id = $1 AND e.to_status::text = 'CANCELLED' AND e.actor_id = $2""",
            creator_id, user_id,
        )
        collab_niches = await conn.fetch(
            """SELECT b.niche FROM deals d JOIN briefs b ON b.id = d.brief_id
               WHERE d.creator_id = $1 AND d.status::text = 'COMPLETED'""",
            creator_id,
        )
    by_status = {r["status"]: int(r["n"]) for r in status_rows}
    return {
        "deals_by_status": by_status,
        "completed_deals": by_status.get("COMPLETED", 0),
        "funded_deals": sum(by_status.get(s, 0) for s in FUNDED_STATUSES),
        "engaged_deals": sum(n for s, n in by_status.items() if s != "OFFER_SENT"),
        "milestones": dict(milestones) if milestones else {},
        "review_count": int(reviews["n"]) if reviews else 0,
        "avg_rating": reviews["avg_rating"] if reviews else None,
        "dispute_count": int(disputes["n"]) if disputes else 0,
        "disputes_lost": int(disputes["lost"]) if disputes else 0,
        "offer_responses": int(response["n"]) if response else 0,
        "avg_response_hours": response["avg_hours"] if response else None,
        "creator_cancellations": int(creator_cancellations or 0),
        "completed_collab_niches": [r["niche"] for r in collab_niches if r["niche"]],
    }


async def get_deal_fraud_facts(pool: asyncpg.Pool, deal_id: UUID, failure_window_days: int = 7) -> dict[str, Any] | None:
    row = await pool.fetchrow(
        """SELECT d.id, d.amount, d.currency, d.status::text AS status, d.created_at,
                  d.brand_id, bp.user_id AS brand_user_id, bu.created_at AS brand_user_created_at,
                  bu.kyc_status::text AS brand_kyc_status,
                  d.creator_id, cp.user_id AS creator_user_id, cu.created_at AS creator_user_created_at
           FROM deals d
           JOIN brand_profiles bp ON bp.id = d.brand_id
           JOIN users bu ON bu.id = bp.user_id
           JOIN creator_profiles cp ON cp.id = d.creator_id
           JOIN users cu ON cu.id = cp.user_id
           WHERE d.id = $1""",
        deal_id,
    )
    if row is None:
        return None
    facts = dict(row)
    facts["failed_intents_deal"] = int(
        await pool.fetchval(
            "SELECT count(*) FROM payment_intents WHERE deal_id = $1 AND status::text = 'FAILED'", deal_id
        )
    )
    facts["failed_intents_brand_window"] = int(
        await pool.fetchval(
            """SELECT count(*) FROM payment_intents pi JOIN deals d ON d.id = pi.deal_id
               WHERE d.brand_id = $1 AND pi.status::text = 'FAILED'
                 AND pi.created_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $2)""",
            facts["brand_id"], failure_window_days,
        )
    )
    facts["failure_window_days"] = failure_window_days
    return facts
