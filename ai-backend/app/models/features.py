"""Typed inputs for the pure ranking/scoring functions (no DB types leak in)."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from app.utils.benchmarks import normalise_engagement


@dataclass
class CandidateCreator:
    creator_id: str
    similarity: float | None = None  # cosine(creator, brief); None when no embedding
    followers: int | None = None
    engagement_rate: float | None = None
    reliability_score: int | None = None  # persisted creator_scores value
    authenticity_score: int | None = None
    available: bool = True
    platforms: list[str] = field(default_factory=list)
    niches: list[str] = field(default_factory=list)
    location: str = ""

    @classmethod
    def from_row(cls, row: Mapping[str, Any], similarity: float | None) -> "CandidateCreator":
        return cls(
            creator_id=str(row["id"]),
            similarity=similarity,
            followers=int(row["followers_total"]) if row.get("followers_total") else None,
            engagement_rate=normalise_engagement(row.get("engagement_rate")),
            reliability_score=row.get("reliability_score"),
            authenticity_score=row.get("authenticity_score"),
            available=bool(row.get("available", True)),
            platforms=[str(p).upper() for p in (row.get("platforms") or [])],
            niches=list(row.get("niches") or []),
            location=row.get("location") or "",
        )


@dataclass
class BriefCriteria:
    brief_id: str
    niche: str = ""
    platforms: list[str] = field(default_factory=list)
    min_followers: int = 0
    min_engagement: float = 0.0
    locations: list[str] = field(default_factory=list)
    budget_per_creator: int | None = None

    @classmethod
    def from_row(cls, row: Mapping[str, Any]) -> "BriefCriteria":
        return cls(
            brief_id=str(row["id"]),
            niche=row.get("niche") or "",
            platforms=[str(p).upper() for p in (row.get("platforms") or [])],
            min_followers=int(row.get("min_followers") or 0),
            min_engagement=normalise_engagement(row.get("min_engagement") or 0.0) or 0.0,
            locations=[l for l in (row.get("locations") or []) if l],
            budget_per_creator=row.get("budget_per_creator"),
        )
