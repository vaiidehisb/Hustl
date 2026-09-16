"""Engagement-rate benchmarks. ER falls as audiences grow, so compare within tier;
some niches structurally engage less (finance, tech) or more (beauty, family)."""

from __future__ import annotations

from collections.abc import Iterable

from app.utils.niches import canonical_niches

NICHE_ER_MULTIPLIER: dict[str, float] = {
    "beauty": 1.15, "fashion": 1.1, "family": 1.15, "fitness": 1.05, "food": 1.05,
    "travel": 1.0, "lifestyle": 1.0, "entertainment": 1.1, "sports": 1.0, "gaming": 0.95,
    "education": 0.9, "tech": 0.85, "finance": 0.8, "automotive": 0.9,
}


def tier_benchmark_er(followers: int | float | None) -> float:
    f = followers or 0
    if f < 10_000:
        return 0.06
    if f < 100_000:
        return 0.035
    if f < 1_000_000:
        return 0.02
    return 0.012


def benchmark_er(followers: int | float | None, niches: Iterable[str] | None = None) -> float:
    base = tier_benchmark_er(followers)
    mults = [NICHE_ER_MULTIPLIER[n] for n in canonical_niches(niches) if n in NICHE_ER_MULTIPLIER]
    return base * (sum(mults) / len(mults) if mults else 1.0)


def normalise_engagement(value: float | None) -> float | None:
    """Engagement is stored as a fraction (0.042). Accept percent input (4.2) defensively."""
    if value is None:
        return None
    return value / 100.0 if value > 1 else value
