from __future__ import annotations

import time
from typing import Any
from uuid import UUID

import asyncpg

from app.config import get_settings
from app.models.features import BriefCriteria, CandidateCreator
from app.modules.matching.rerank import rerank
from app.repositories import briefs as briefs_repo
from app.repositories import creators as creators_repo
from app.repositories import embeddings as vec_repo
from app.services.embedding_store import as_vector, ensure_brief_embedding
from app.utils.errors import not_found


async def match_brief(pool: asyncpg.Pool, brief_id: UUID, limit: int = 20) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    started = time.perf_counter()
    brief = await briefs_repo.get_brief(pool, brief_id)
    if brief is None:
        raise not_found("Brief", brief_id)

    emb = await ensure_brief_embedding(pool, brief_id, brief=brief)
    pool_size = get_settings().match_candidate_pool
    hits = await vec_repo.ann_creators(pool, emb["embedding_model"], as_vector(emb), pool_size)
    similarity = {cid: sim for cid, sim in hits}
    rows = await creators_repo.get_creators_for_matching(pool, list(similarity))
    candidates = [CandidateCreator.from_row(r, similarity.get(r["id"])) for r in rows]
    results = rerank(candidates, BriefCriteria.from_row(brief), limit)

    meta = {
        "brief_id": str(brief_id),
        "embedding_model": emb["embedding_model"],
        "vector_backend": emb["vector_backend"],
        "candidates_considered": len(hits),
        "eligible_candidates": len(candidates),
        "weights": {"semantic": 0.40, "engagement_fit": 0.20, "follower_fit": 0.15, "reliability": 0.15,
                    "availability": 0.10},
        "latency_ms": round((time.perf_counter() - started) * 1000, 1),
    }
    if not hits:
        meta["note"] = "no creator embeddings for this model; refresh creator embeddings first"
    return results, meta
