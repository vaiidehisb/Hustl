"""asyncpg connection pool lifecycle. The pool is created lazily so the service
still boots (and /health reports the problem) when PostgreSQL is down."""

from __future__ import annotations

import asyncio
import json
import logging

import asyncpg

from app.config import get_settings
from app.utils.errors import integration_unavailable

log = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None
_lock = asyncio.Lock()
_last_error: str | None = None


async def _init_connection(conn: asyncpg.Connection) -> None:
    for typ in ("json", "jsonb"):
        await conn.set_type_codec(typ, encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


async def create_pool() -> asyncpg.Pool:
    global _pool, _last_error
    settings = get_settings()
    if not settings.dsn:
        raise integration_unavailable("PostgreSQL", ["DATABASE_URL"])
    async with _lock:
        if _pool is None:
            try:
                _pool = await asyncpg.create_pool(
                    settings.dsn,
                    min_size=settings.db_pool_min_size,
                    max_size=settings.db_pool_max_size,
                    init=_init_connection,
                    command_timeout=30,
                )
                _last_error = None
            except (OSError, asyncpg.PostgresError, asyncio.TimeoutError) as exc:
                _last_error = f"{type(exc).__name__}: {exc}"
                log.warning("PostgreSQL unavailable: %s", _last_error)
                raise integration_unavailable("PostgreSQL", reason=_last_error) from exc
    return _pool


async def get_pool() -> asyncpg.Pool:
    if _pool is not None:
        return _pool
    return await create_pool()


def current_pool() -> asyncpg.Pool | None:
    return _pool


def last_error() -> str | None:
    return _last_error


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
