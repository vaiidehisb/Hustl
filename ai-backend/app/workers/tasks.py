"""Celery tasks. Each task runs the async service code on a fresh event loop with its own pool."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

import asyncpg

from app.config import get_settings
from app.db.migrate import run_migrations
from app.services import batch
from app.services.runtime import state
from app.workers.celery_app import celery_app


async def _with_pool(fn: Callable[[asyncpg.Pool], Awaitable[dict[str, Any]]]) -> dict[str, Any]:
    s = get_settings()
    pool = await asyncpg.create_pool(s.dsn, min_size=1, max_size=4)
    try:
        async with pool.acquire() as conn:
            state.vector_backend = await run_migrations(conn)
            state.migrations_applied = True
        return await fn(pool)
    finally:
        await pool.close()


def _uuids(values: list[str] | None) -> list[UUID] | None:
    return [UUID(v) for v in values] if values is not None else None


@celery_app.task(name="ai.refresh_embeddings")
def refresh_embeddings(kind: str, ids: list[str] | None = None, force: bool = False) -> dict[str, Any]:
    return asyncio.run(_with_pool(lambda p: batch.refresh_embeddings(p, kind, _uuids(ids), force)))


@celery_app.task(name="ai.recompute_scores")
def recompute_scores(creator_ids: list[str] | None = None) -> dict[str, Any]:
    return asyncio.run(_with_pool(lambda p: batch.recompute_scores(p, _uuids(creator_ids))))


@celery_app.task(name="ai.score_applications")
def score_applications(application_ids: list[str] | None = None, brief_id: str | None = None) -> dict[str, Any]:
    return asyncio.run(_with_pool(
        lambda p: batch.score_applications(p, _uuids(application_ids), UUID(brief_id) if brief_id else None)
    ))
