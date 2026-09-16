"""Idempotent migration runner for the `ai` schema.

Usage: python -m app.db.migrate

Files in app/db/migrations are applied in name order. A file named
`NNN_name.pgvector.sql` / `NNN_name.array.sql` is a variant: exactly one of the
pair runs, depending on whether the `vector` extension is available. Every file
is safe to re-run (IF NOT EXISTS everywhere); ai.schema_migrations records what
ran for visibility, but files are re-applied each time so drift self-heals.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Literal

import asyncpg

log = logging.getLogger(__name__)

MIGRATIONS_DIR = Path(__file__).parent / "migrations"
VectorBackend = Literal["pgvector", "array"]


async def pgvector_available(conn: asyncpg.Connection) -> bool:
    return bool(await conn.fetchval("SELECT 1 FROM pg_available_extensions WHERE name = 'vector'"))


async def detect_vector_backend(conn: asyncpg.Connection) -> VectorBackend:
    """Report what the embedding column actually is (tables may predate pgvector)."""
    udt = await conn.fetchval(
        """SELECT udt_name FROM information_schema.columns
           WHERE table_schema = 'ai' AND table_name = 'creator_embeddings' AND column_name = 'embedding'"""
    )
    return "pgvector" if udt == "vector" else "array"


def select_files(has_vector: bool) -> list[Path]:
    wanted = "pgvector" if has_vector else "array"
    files = []
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        parts = path.name.split(".")
        variant = parts[-2] if len(parts) == 3 else None
        if variant is None or variant == wanted:
            files.append(path)
    return files


async def run_migrations(conn: asyncpg.Connection) -> VectorBackend:
    has_vector = await pgvector_available(conn)
    for path in select_files(has_vector):
        sql = path.read_text(encoding="utf-8")
        async with conn.transaction():
            await conn.execute(sql)
            await conn.execute(
                "INSERT INTO ai.schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", path.name
            )
        log.info("applied migration %s", path.name)
    return await detect_vector_backend(conn)


async def _main() -> None:
    from app.config import get_settings

    settings = get_settings()
    if not settings.dsn:
        raise SystemExit("DATABASE_URL is not set")
    conn = await asyncpg.connect(settings.dsn)
    try:
        backend = await run_migrations(conn)
        print(f"ai schema migrated (vector_backend={backend})")
    finally:
        await conn.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(_main())
