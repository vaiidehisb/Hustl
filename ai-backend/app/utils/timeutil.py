from __future__ import annotations

from datetime import datetime, timezone


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(dt: datetime | None) -> datetime | None:
    """Prisma stores `timestamp without time zone` in UTC; make it tz-aware."""
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def days_between(earlier: datetime | None, later: datetime | None = None) -> float | None:
    e = as_utc(earlier)
    if e is None:
        return None
    l = as_utc(later) or utcnow()
    return (l - e).total_seconds() / 86_400
