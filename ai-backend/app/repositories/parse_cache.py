from __future__ import annotations

from typing import Any

import asyncpg


async def get(pool: asyncpg.Pool, input_hash: str) -> dict[str, Any] | None:
    row = await pool.fetchrow(
        """UPDATE ai.brief_parse_cache SET hit_count = hit_count + 1, last_hit_at = now()
           WHERE input_hash = $1 RETURNING source, model, result""",
        input_hash,
    )
    return dict(row) if row else None


async def put(pool: asyncpg.Pool, input_hash: str, source: str, model: str | None, result: dict[str, Any]) -> None:
    await pool.execute(
        """INSERT INTO ai.brief_parse_cache (input_hash, source, model, result)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (input_hash) DO UPDATE SET source = EXCLUDED.source, model = EXCLUDED.model,
             result = EXCLUDED.result, created_at = now()""",
        input_hash, source, model, result,
    )
