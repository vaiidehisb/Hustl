"""All /ai/* routes (internal only; token-protected at router level in main.py)."""

from __future__ import annotations

from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, Query

from app.api.deps import get_db, get_optional_db
from app.modules.application_scoring import service as application_service
from app.modules.brief_parser import service as brief_parser_service
from app.modules.creator_scoring import service as scoring_service
from app.modules.fraud_detection import service as fraud_service
from app.modules.matching import service as matching_service
from app.schemas.requests import (
    ApplicationBatchRequest,
    ApplicationScoreRequest,
    EmbeddingBatchRequest,
    MatchRequest,
    ParseBriefRequest,
    ScoreBatchRequest,
)
from app.services import batch
from app.services.embedding_store import ensure_brief_embedding, ensure_creator_embedding, public
from app.utils.errors import integration_unavailable, ok

router = APIRouter(prefix="/ai")


# ── Module 1: matching ───────────────────────────────────────────────────────
@router.post("/match")
async def match(body: MatchRequest, pool: asyncpg.Pool = Depends(get_db)) -> dict:
    results, meta = await matching_service.match_brief(pool, body.brief_id, body.limit)
    return ok(results, meta)


# ── Module 2: creator scoring ────────────────────────────────────────────────
@router.post("/scores/refresh/{creator_id}")
async def refresh_scores(creator_id: UUID, pool: asyncpg.Pool = Depends(get_db)) -> dict:
    return ok(await scoring_service.refresh_scores(pool, creator_id))


@router.post("/scores/recompute-batch")
async def recompute_scores_batch(body: ScoreBatchRequest, pool: asyncpg.Pool = Depends(get_db)) -> dict:
    ids = [str(i) for i in body.creator_ids] if body.creator_ids is not None else None
    if batch.celery_enabled():
        return ok(batch.enqueue("ai.recompute_scores", creator_ids=ids))
    return ok({"mode": "inline", **(await batch.recompute_scores(pool, body.creator_ids))})


# ── Module 3: brief parser ───────────────────────────────────────────────────
@router.post("/parse-brief")
async def parse_brief(body: ParseBriefRequest, pool: asyncpg.Pool | None = Depends(get_optional_db)) -> dict:
    return ok(await brief_parser_service.parse_brief(pool, body))


# ── Module 4: fraud ──────────────────────────────────────────────────────────
@router.post("/fraud/analyze-creator/{creator_id}")
async def analyze_creator(creator_id: UUID, pool: asyncpg.Pool = Depends(get_db)) -> dict:
    return ok(await fraud_service.analyze_creator(pool, creator_id))


@router.post("/fraud/analyze-deal/{deal_id}")
async def analyze_deal(deal_id: UUID, pool: asyncpg.Pool = Depends(get_db)) -> dict:
    return ok(await fraud_service.analyze_deal(pool, deal_id))


# ── Module 5: application scoring ────────────────────────────────────────────
@router.post("/applications/score")
async def score_application(body: ApplicationScoreRequest, pool: asyncpg.Pool = Depends(get_db)) -> dict:
    return ok(await application_service.score(pool, body.application_id, body.creator_id, body.brief_id))


@router.post("/applications/score-batch")
async def score_applications_batch(body: ApplicationBatchRequest, pool: asyncpg.Pool = Depends(get_db)) -> dict:
    if batch.celery_enabled():
        return ok(batch.enqueue(
            "ai.score_applications",
            application_ids=[str(i) for i in body.application_ids] if body.application_ids else None,
            brief_id=str(body.brief_id) if body.brief_id else None,
        ))
    return ok({"mode": "inline", **(await batch.score_applications(pool, body.application_ids, body.brief_id))})


# ── Embeddings ───────────────────────────────────────────────────────────────
@router.post("/embeddings/creators/{creator_id}")
async def embed_creator(creator_id: UUID, force: bool = Query(False), pool: asyncpg.Pool = Depends(get_db)) -> dict:
    return ok(public(await ensure_creator_embedding(pool, creator_id, force=force)))


@router.post("/embeddings/briefs/{brief_id}")
async def embed_brief(brief_id: UUID, force: bool = Query(False), pool: asyncpg.Pool = Depends(get_db)) -> dict:
    return ok(public(await ensure_brief_embedding(pool, brief_id, force=force)))


@router.post("/embeddings/refresh-batch")
async def refresh_embeddings_batch(body: EmbeddingBatchRequest, pool: asyncpg.Pool = Depends(get_db)) -> dict:
    if batch.celery_enabled():
        return ok(batch.enqueue(
            "ai.refresh_embeddings", kind=body.kind,
            ids=[str(i) for i in body.ids] if body.ids is not None else None, force=body.force,
        ))
    return ok({"mode": "inline", **(await batch.refresh_embeddings(pool, body.kind, body.ids, body.force))})


# ── Task status (Celery mode) ────────────────────────────────────────────────
@router.get("/tasks/{task_id}")
async def task_status(task_id: str) -> dict:
    if not batch.celery_enabled():
        raise integration_unavailable("Celery", ["REDIS_URL"])
    from app.workers.celery_app import celery_app

    res = celery_app.AsyncResult(task_id)
    data = {"task_id": task_id, "state": res.state}
    if res.successful():
        data["result"] = res.result
    elif res.failed():
        data["error"] = str(res.result)
    return ok(data)
