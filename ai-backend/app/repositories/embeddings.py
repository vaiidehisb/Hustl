"""Vector storage in the `ai` schema.

pgvector mode: vector(384) column, HNSW cosine index, `<=>` ANN queries.
array mode: double precision[] column; ANN = exact cosine in numpy over an
in-process matrix cached per model and invalidated on (row count, max updated_at).
"""

from __future__ import annotations

import asyncio
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal
from uuid import UUID

import asyncpg
import numpy as np

from app.db.migrate import detect_vector_backend
from app.services.runtime import state

Kind = Literal["creator", "brief"]
TABLES: dict[str, str] = {"creator": "ai.creator_embeddings", "brief": "ai.brief_embeddings"}


def _to_pgvector(vec: Sequence[float]) -> str:
    return "[" + ",".join(f"{float(x):.7g}" for x in vec) + "]"


def _parse_pgvector(text: str) -> np.ndarray:
    return np.array([float(x) for x in text.strip("[]").split(",") if x], dtype=np.float64)


async def vector_backend(pool: asyncpg.Pool) -> str:
    if state.vector_backend is None:
        async with pool.acquire() as conn:
            state.vector_backend = await detect_vector_backend(conn)
    return state.vector_backend


@dataclass
class StoredEmbedding:
    id: UUID
    model: str
    dims: int
    embedding: np.ndarray
    content_hash: str


async def get_embedding(pool: asyncpg.Pool, kind: Kind, entity_id: UUID) -> StoredEmbedding | None:
    backend = await vector_backend(pool)
    col = "embedding::text AS embedding" if backend == "pgvector" else "embedding"
    row = await pool.fetchrow(
        f"SELECT id, model, dims, {col}, content_hash FROM {TABLES[kind]} WHERE id = $1", entity_id
    )
    if row is None:
        return None
    emb = _parse_pgvector(row["embedding"]) if backend == "pgvector" else np.asarray(row["embedding"], dtype=np.float64)
    return StoredEmbedding(row["id"], row["model"], row["dims"], emb, row["content_hash"])


async def upsert_embedding(
    pool: asyncpg.Pool, kind: Kind, entity_id: UUID, model: str, vector: Sequence[float], chash: str
) -> None:
    backend = await vector_backend(pool)
    value = _to_pgvector(vector) if backend == "pgvector" else [float(x) for x in vector]
    cast = "::vector" if backend == "pgvector" else "::double precision[]"
    await pool.execute(
        f"""INSERT INTO {TABLES[kind]} (id, model, dims, embedding, content_hash, updated_at)
            VALUES ($1, $2, $3, $4{cast}, $5, now())
            ON CONFLICT (id) DO UPDATE SET model = EXCLUDED.model, dims = EXCLUDED.dims,
              embedding = EXCLUDED.embedding, content_hash = EXCLUDED.content_hash, updated_at = now()""",
        entity_id, model, len(vector), value, chash,
    )
    if kind == "creator" and backend == "array":
        _matrix_cache.pop(model, None)


# ── ANN ──────────────────────────────────────────────────────────────────────

@dataclass
class _Matrix:
    token: tuple
    ids: list[UUID]
    matrix: np.ndarray  # rows L2-normalised


_matrix_cache: dict[str, _Matrix] = {}
_matrix_lock = asyncio.Lock()


async def _creator_matrix(pool: asyncpg.Pool, model: str) -> _Matrix:
    token_row = await pool.fetchrow(
        "SELECT count(*) AS n, max(updated_at) AS ts FROM ai.creator_embeddings WHERE model = $1", model
    )
    token = (token_row["n"], token_row["ts"])
    cached = _matrix_cache.get(model)
    if cached and cached.token == token:
        return cached
    async with _matrix_lock:
        cached = _matrix_cache.get(model)
        if cached and cached.token == token:
            return cached
        rows = await pool.fetch("SELECT id, embedding FROM ai.creator_embeddings WHERE model = $1", model)
        ids = [r["id"] for r in rows]
        if rows:
            m = np.asarray([r["embedding"] for r in rows], dtype=np.float64)
            norms = np.linalg.norm(m, axis=1, keepdims=True)
            norms[norms == 0] = 1.0
            m = m / norms
        else:
            m = np.zeros((0, 0))
        built = _Matrix(token, ids, m)
        _matrix_cache[model] = built
        return built


async def ann_creators(
    pool: asyncpg.Pool, model: str, query: Sequence[float], k: int
) -> list[tuple[UUID, float]]:
    """Top-k creators by cosine similarity, restricted to vectors from `model`."""
    backend = await vector_backend(pool)
    if backend == "pgvector":
        rows = await pool.fetch(
            """SELECT id, 1 - (embedding <=> $1::vector) AS similarity
               FROM ai.creator_embeddings WHERE model = $2
               ORDER BY embedding <=> $1::vector LIMIT $3""",
            _to_pgvector(query), model, k,
        )
        return [(r["id"], float(r["similarity"])) for r in rows]

    mat = await _creator_matrix(pool, model)
    if not mat.ids:
        return []
    q = np.asarray(query, dtype=np.float64)
    qn = np.linalg.norm(q)
    if qn == 0 or mat.matrix.shape[1] != q.shape[0]:
        return []
    sims = mat.matrix @ (q / qn)
    k = min(k, len(mat.ids))
    top = np.argpartition(-sims, k - 1)[:k]
    top = top[np.argsort(-sims[top])]
    return [(mat.ids[i], float(sims[i])) for i in top]
