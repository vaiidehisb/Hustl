"""Batch jobs. Run through Celery when REDIS_URL is set, otherwise inline in-request."""

from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import Any
from uuid import UUID

import asyncpg

from app.config import get_settings
from app.modules.application_scoring import service as application_service
from app.modules.creator_scoring import service as scoring_service
from app.repositories import briefs as briefs_repo
from app.repositories import creators as creators_repo
from app.services.embedding_store import ensure_brief_embedding, ensure_creator_embedding, public
from app.utils.errors import AppError

log = logging.getLogger(__name__)


def _error(entity_id: UUID, exc: Exception) -> dict[str, Any]:
    if isinstance(exc, AppError):
        return {"id": str(entity_id), "ok": False, "error": {"code": exc.code, "message": exc.message}}
    log.exception("batch item failed: %s", entity_id)
    return {"id": str(entity_id), "ok": False, "error": {"code": "INTERNAL_ERROR", "message": str(exc)}}


async def refresh_embeddings(pool: asyncpg.Pool, kind: str, ids: Sequence[UUID] | None, force: bool = False) -> dict[str, Any]:
    if ids is None:
        ids = await (creators_repo.list_creator_ids(pool) if kind == "creator"
                     else briefs_repo.list_brief_ids(pool, ("PUBLISHED", "DRAFT")))
    fn = ensure_creator_embedding if kind == "creator" else ensure_brief_embedding
    results = []
    for entity_id in ids:
        try:
            results.append({"ok": True, **public(await fn(pool, entity_id, force=force))})
        except Exception as exc:  # noqa: BLE001 — per-item isolation
            results.append(_error(entity_id, exc))
    return {"kind": kind, "total": len(results), "updated": sum(1 for r in results if r.get("updated")),
            "failed": sum(1 for r in results if not r["ok"]), "results": results}


async def recompute_scores(pool: asyncpg.Pool, creator_ids: Sequence[UUID] | None) -> dict[str, Any]:
    if creator_ids is None:
        creator_ids = await creators_repo.list_creator_ids(pool)
    results = []
    for cid in creator_ids:
        try:
            results.append({"ok": True, **(await scoring_service.refresh_scores(pool, cid))})
        except Exception as exc:  # noqa: BLE001
            results.append(_error(cid, exc))
    return {"total": len(results), "failed": sum(1 for r in results if not r["ok"]), "results": results}


async def score_applications(
    pool: asyncpg.Pool, application_ids: Sequence[UUID] | None, brief_id: UUID | None
) -> dict[str, Any]:
    ids = list(application_ids or [])
    if brief_id is not None:
        ids += [i for i in await briefs_repo.list_application_ids_for_brief(pool, brief_id) if i not in ids]
    results = []
    for aid in ids:
        try:
            results.append({"ok": True, **(await application_service.score(pool, application_id=aid))})
        except Exception as exc:  # noqa: BLE001
            results.append(_error(aid, exc))
    return {"total": len(results), "failed": sum(1 for r in results if not r["ok"]), "results": results}


def celery_enabled() -> bool:
    return bool(get_settings().redis_url)


def enqueue(task_name: str, **kwargs: Any) -> dict[str, Any]:
    from app.workers.celery_app import celery_app

    result = celery_app.send_task(task_name, kwargs=kwargs)
    return {"mode": "celery", "task_id": result.id, "task": task_name}
