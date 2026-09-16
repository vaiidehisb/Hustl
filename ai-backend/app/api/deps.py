from __future__ import annotations

import hmac

import asyncpg
from fastapi import Header

from app.config import get_settings
from app.db.bootstrap import ensure_ready
from app.utils.errors import AppError, forbidden, integration_unavailable


async def require_internal_token(x_internal_token: str | None = Header(default=None)) -> None:
    expected = get_settings().internal_service_token
    if not expected:
        raise forbidden("Internal service token is not configured")
    if not x_internal_token or not hmac.compare_digest(x_internal_token.encode(), expected.encode()):
        raise forbidden("Invalid internal service token")


async def get_db() -> asyncpg.Pool:
    try:
        return await ensure_ready()
    except AppError:
        raise
    except (OSError, asyncpg.PostgresError) as exc:
        raise integration_unavailable("PostgreSQL", reason=f"{type(exc).__name__}: {exc}") from exc


async def get_optional_db() -> asyncpg.Pool | None:
    try:
        return await get_db()
    except AppError:
        return None
