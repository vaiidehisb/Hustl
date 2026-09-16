from __future__ import annotations

from typing import Any
from uuid import UUID

import asyncpg

from app.models.features import BriefCriteria, CandidateCreator
from app.modules.application_scoring.scorer import score_application
from app.repositories import briefs as briefs_repo
from app.repositories import creators as creators_repo
from app.services.embedding import aembed
from app.services.embedding_store import as_vector, ensure_brief_embedding, ensure_creator_embedding
from app.utils.errors import not_found, validation_error
from app.utils.mathx import cosine


async def score(
    pool: asyncpg.Pool,
    application_id: UUID | None = None,
    creator_id: UUID | None = None,
    brief_id: UUID | None = None,
) -> dict[str, Any]:
    application = None
    if application_id is not None:
        application = await briefs_repo.get_application(pool, application_id)
        if application is None:
            raise not_found("Application", application_id)
        creator_id, brief_id = application["creator_id"], application["brief_id"]
    elif creator_id is None or brief_id is None:
        raise validation_error("Provide application_id, or both creator_id and brief_id")
    else:
        application = await briefs_repo.get_application_by_pair(pool, brief_id, creator_id)

    brief = await briefs_repo.get_brief(pool, brief_id)
    if brief is None:
        raise not_found("Brief", brief_id)
    rows = await creators_repo.get_creators_for_matching(pool, [creator_id])
    if not rows:
        raise not_found("Creator", creator_id)

    brief_emb = await ensure_brief_embedding(pool, brief_id, brief=brief)
    creator_emb = await ensure_creator_embedding(pool, creator_id)
    bvec = as_vector(brief_emb)
    similarity = cosine(as_vector(creator_emb), bvec)

    pitch_similarity = None
    pitch = (application or {}).get("pitch") or ""
    if pitch.strip():
        pitch_similarity = cosine((await aembed([pitch]))[0], bvec)

    result = score_application(
        CandidateCreator.from_row(rows[0], similarity),
        BriefCriteria.from_row(brief),
        pitch_similarity=pitch_similarity,
        proposed_rate=(application or {}).get("proposed_rate"),
    )
    return {
        "application_id": str(application["id"]) if application else None,
        "creator_id": str(creator_id),
        "brief_id": str(brief_id),
        **result,
        "embedding_model": brief_emb["embedding_model"],
    }
