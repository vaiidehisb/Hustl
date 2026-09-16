from __future__ import annotations

import asyncio

from fastapi import APIRouter

from app.config import get_settings
from app.db.bootstrap import ensure_ready
from app.services.embedding import embedding_status
from app.services.runtime import state
from app.utils.errors import AppError, ok

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    s = get_settings()
    database: dict = {"status": "down"}
    try:
        pool = await asyncio.wait_for(ensure_ready(), timeout=5)
        await asyncio.wait_for(pool.fetchval("SELECT 1"), timeout=2)
        database = {"status": "up"}
    except AppError as exc:
        database["error"] = exc.details
    except Exception as exc:  # noqa: BLE001 — health must never raise
        database["error"] = f"{type(exc).__name__}: {exc}"

    data = {
        "status": "ok" if database["status"] == "up" else "degraded",
        "service": s.app_name,
        "database": database,
        "embedding": embedding_status(),
        "embedding_model": embedding_status()["model"],
        "vector_backend": state.vector_backend,
        "migrations": {"applied": state.migrations_applied, "error": state.migration_error},
        "brief_parser": {"engine": "claude" if s.anthropic_api_key else "rules",
                         "model": s.brief_parser_model if s.anthropic_api_key else None},
        "scoring_model": s.scoring_model,
        "batch_mode": "celery" if s.redis_url else "inline",
    }
    return ok(data)
