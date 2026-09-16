"""Process-wide runtime facts discovered at startup."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class RuntimeState:
    vector_backend: str | None = None  # "pgvector" | "array" | None (unknown until DB reachable)
    migrations_applied: bool = False
    migration_error: str | None = None
    extra: dict = field(default_factory=dict)


state = RuntimeState()
