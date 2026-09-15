"""Build embeddings from real rows and keep ai.* vectors fresh (skip when content unchanged)."""

from __future__ import annotations

from typing import Any
from uuid import UUID

import asyncpg
import numpy as np

from app.repositories import briefs as briefs_repo
from app.repositories import creators as creators_repo
from app.repositories import embeddings as vec_repo
from app.services.embedding import aembed, get_embedder
from app.services.embedding_text import brief_text, content_hash, creator_text
from app.utils.errors import not_found, validation_error


async def _ensure(pool: asyncpg.Pool, kind: str, entity_id: UUID, text: str, force: bool) -> dict[str, Any]:
    emb = get_embedder()
    if not text:
        raise validation_error(f"{kind} has no text content to embed", {"id": str(entity_id)})
    chash = content_hash(emb.name, text)
    existing = await vec_repo.get_embedding(pool, kind, entity_id)  # type: ignore[arg-type]
    if not force and existing and existing.content_hash == chash and existing.model == emb.name:
        return {"id": str(entity_id), "embedding_model": emb.name, "dims": existing.dims, "content_hash": chash,
                "updated": False, "vector_backend": await vec_repo.vector_backend(pool), "_vector": existing.embedding}
    vector = (await aembed([text]))[0]
    await vec_repo.upsert_embedding(pool, kind, entity_id, emb.name, vector.tolist(), chash)  # type: ignore[arg-type]
    return {"id": str(entity_id), "embedding_model": emb.name, "dims": int(vector.shape[0]), "content_hash": chash,
            "updated": True, "vector_backend": await vec_repo.vector_backend(pool), "_vector": vector}


async def ensure_creator_embedding(pool: asyncpg.Pool, creator_id: UUID, force: bool = False) -> dict[str, Any]:
    profile = await creators_repo.get_creator(pool, creator_id)
    if profile is None:
        raise not_found("Creator", creator_id)
    accounts = [a for a in await creators_repo.get_social_accounts(pool, creator_id) if a["status"] != "DISCONNECTED"]
    return await _ensure(pool, "creator", creator_id, creator_text(profile, accounts), force)


async def ensure_brief_embedding(
    pool: asyncpg.Pool, brief_id: UUID, force: bool = False, brief: dict[str, Any] | None = None
) -> dict[str, Any]:
    brief = brief or await briefs_repo.get_brief(pool, brief_id)
    if brief is None:
        raise not_found("Brief", brief_id)
    return await _ensure(pool, "brief", brief_id, brief_text(brief), force)


def public(result: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in result.items() if not k.startswith("_")}


def as_vector(result: dict[str, Any]) -> np.ndarray:
    return np.asarray(result["_vector"], dtype=np.float64)
