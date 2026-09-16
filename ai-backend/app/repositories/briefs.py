"""Read-only access to briefs and applications."""

from __future__ import annotations

from typing import Any
from uuid import UUID

import asyncpg

_BRIEF_COLS = """
    b.id, b.brand_id, b.title, b.description, b.requirements, b.niche, b.platforms::text[] AS platforms,
    b.deliverables, b.min_followers, b.min_engagement, b.budget_per_creator, b.currency, b.creators_needed,
    b.locations, b.timeline, b.audience, b.status::text AS status, b.deadline, b.created_at, b.updated_at
"""


async def get_brief(pool: asyncpg.Pool, brief_id: UUID) -> dict[str, Any] | None:
    row = await pool.fetchrow(
        f"SELECT {_BRIEF_COLS} FROM briefs b WHERE b.id = $1 AND b.deleted_at IS NULL", brief_id
    )
    return dict(row) if row else None


async def list_brief_ids(pool: asyncpg.Pool, statuses: tuple[str, ...] = ("PUBLISHED",)) -> list[UUID]:
    rows = await pool.fetch(
        "SELECT id FROM briefs WHERE deleted_at IS NULL AND status::text = ANY($1::text[]) ORDER BY id",
        list(statuses),
    )
    return [r["id"] for r in rows]


async def get_application(pool: asyncpg.Pool, application_id: UUID) -> dict[str, Any] | None:
    row = await pool.fetchrow(
        """SELECT id, brief_id, creator_id, pitch, proposed_rate, status::text AS status
           FROM applications WHERE id = $1""",
        application_id,
    )
    return dict(row) if row else None


async def get_application_by_pair(pool: asyncpg.Pool, brief_id: UUID, creator_id: UUID) -> dict[str, Any] | None:
    row = await pool.fetchrow(
        """SELECT id, brief_id, creator_id, pitch, proposed_rate, status::text AS status
           FROM applications WHERE brief_id = $1 AND creator_id = $2""",
        brief_id, creator_id,
    )
    return dict(row) if row else None


async def list_application_ids_for_brief(pool: asyncpg.Pool, brief_id: UUID) -> list[UUID]:
    rows = await pool.fetch(
        "SELECT id FROM applications WHERE brief_id = $1 AND status::text <> 'WITHDRAWN' ORDER BY created_at",
        brief_id,
    )
    return [r["id"] for r in rows]
