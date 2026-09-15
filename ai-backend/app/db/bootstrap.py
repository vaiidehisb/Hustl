"""Make sure the pool exists and the ai schema is migrated before DB work."""

from __future__ import annotations

import asyncio
import logging

import asyncpg

from app.config import get_settings
from app.db.migrate import detect_vector_backend, run_migrations
from app.db.pool import get_pool
from app.services.runtime import state

log = logging.getLogger(__name__)
_lock = asyncio.Lock()


async def ensure_ready() -> asyncpg.Pool:
    pool = await get_pool()
    if not state.migrations_applied:
        async with _lock:
            if not state.migrations_applied:
                async with pool.acquire() as conn:
                    if get_settings().run_migrations_on_startup:
                        try:
                            state.vector_backend = await run_migrations(conn)
                            state.migration_error = None
                        except asyncpg.PostgresError as exc:
                            state.migration_error = f"{type(exc).__name__}: {exc}"
                            log.error("ai schema migration failed: %s", state.migration_error)
                            raise
                    else:
                        state.vector_backend = await detect_vector_backend(conn)
                state.migrations_applied = True
    return pool
