"""Read-only access to creator tables in `public` (owned by other services)."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Any
from uuid import UUID

import asyncpg

_PROFILE_COLS = """
    cp.id, cp.user_id, cp.handle, cp.headline, cp.bio, cp.location, cp.country, cp.niches, cp.languages,
    cp.rate_card, cp.portfolio, cp.available, cp.verified_at, cp.followers_total, cp.engagement_rate,
    cp.follower_growth_30d, cp.completed_deals, cp.cancelled_deals, cp.avg_rating, cp.on_time_rate,
    cp.revision_rate, cp.avg_response_hours, cp.created_at,
    u.created_at AS user_created_at, u.kyc_status::text AS kyc_status, u.status::text AS user_status
"""


async def get_creator(pool: asyncpg.Pool, creator_id: UUID) -> dict[str, Any] | None:
    row = await pool.fetchrow(
        f"""SELECT {_PROFILE_COLS}
            FROM creator_profiles cp JOIN users u ON u.id = cp.user_id
            WHERE cp.id = $1 AND cp.deleted_at IS NULL AND u.deleted_at IS NULL""",
        creator_id,
    )
    return dict(row) if row else None


async def get_creators_for_matching(pool: asyncpg.Pool, creator_ids: Sequence[UUID]) -> list[dict[str, Any]]:
    """Profiles + connected platforms + persisted scores for eligible (active, not deleted) creators."""
    if not creator_ids:
        return []
    rows = await pool.fetch(
        f"""SELECT {_PROFILE_COLS},
                   ARRAY(SELECT sa.platform::text FROM social_accounts sa
                         WHERE sa.creator_id = cp.id AND sa.status::text <> 'DISCONNECTED') AS platforms,
                   cs.reliability_score, cs.authenticity_score, cs.trust_score
            FROM creator_profiles cp
            JOIN users u ON u.id = cp.user_id
            LEFT JOIN creator_scores cs ON cs.creator_id = cp.id
            WHERE cp.id = ANY($1::uuid[]) AND cp.deleted_at IS NULL
              AND u.deleted_at IS NULL AND u.status::text = 'ACTIVE'""",
        list(creator_ids),
    )
    return [dict(r) for r in rows]


async def get_social_accounts(pool: asyncpg.Pool, creator_id: UUID) -> list[dict[str, Any]]:
    rows = await pool.fetch(
        """SELECT id, platform::text AS platform, source::text AS source, status::text AS status, handle,
                  followers, following, posts_count, avg_likes, avg_comments, avg_views, engagement_rate,
                  audience_demographics, last_synced_at, created_at
           FROM social_accounts WHERE creator_id = $1 ORDER BY platform""",
        creator_id,
    )
    return [dict(r) for r in rows]


async def get_snapshots(
    pool: asyncpg.Pool, account_ids: Sequence[UUID], since: datetime | None = None
) -> list[dict[str, Any]]:
    if not account_ids:
        return []
    rows = await pool.fetch(
        """SELECT social_account_id, followers, engagement_rate, avg_likes, avg_comments, avg_views, captured_at
           FROM social_metric_snapshots
           WHERE social_account_id = ANY($1::uuid[]) AND ($2::timestamp IS NULL OR captured_at >= $2::timestamp)
           ORDER BY social_account_id, captured_at""",
        list(account_ids), since.replace(tzinfo=None) if since else None,
    )
    return [dict(r) for r in rows]


async def get_creator_scores(pool: asyncpg.Pool, creator_id: UUID) -> dict[str, Any] | None:
    row = await pool.fetchrow(
        """SELECT trust_score, niche_authority, reliability_score, authenticity_score, model_version, computed_at
           FROM creator_scores WHERE creator_id = $1""",
        creator_id,
    )
    return dict(row) if row else None


async def population_features(pool: asyncpg.Pool) -> list[dict[str, Any]]:
    """Per-creator (followers, avg_likes, avg_comments, growth) from accounts with real metrics."""
    rows = await pool.fetch(
        """SELECT cp.id AS creator_id,
                  sum(sa.followers)::float8 AS followers,
                  sum(sa.avg_likes)::float8 AS avg_likes,
                  sum(sa.avg_comments)::float8 AS avg_comments,
                  cp.follower_growth_30d AS growth
           FROM creator_profiles cp
           JOIN social_accounts sa ON sa.creator_id = cp.id
           WHERE cp.deleted_at IS NULL AND sa.status::text <> 'DISCONNECTED'
             AND sa.followers IS NOT NULL AND sa.avg_likes IS NOT NULL AND sa.avg_comments IS NOT NULL
           GROUP BY cp.id, cp.follower_growth_30d"""
    )
    return [dict(r) for r in rows]


async def list_creator_ids(pool: asyncpg.Pool) -> list[UUID]:
    rows = await pool.fetch(
        """SELECT cp.id FROM creator_profiles cp JOIN users u ON u.id = cp.user_id
           WHERE cp.deleted_at IS NULL AND u.deleted_at IS NULL ORDER BY cp.id"""
    )
    return [r["id"] for r in rows]
