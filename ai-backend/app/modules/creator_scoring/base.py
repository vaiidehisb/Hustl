"""Scoring model interface. v1 is a deterministic formula; a v2 XGBoost model
from the MLflow registry implements the same interface and plugs in via
`SCORING_MODEL=v2-xgboost` without touching the API or service layer."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class CreatorScoringInput:
    """Everything a scoring model may use, gathered from real DB rows.
    None means "no data" — models must not substitute invented values."""

    creator_id: str
    niches: list[str] = field(default_factory=list)
    # trust
    completed_deals: int = 0
    funded_deals: int = 0
    avg_brand_rating: float | None = None
    review_count: int = 0
    dispute_count: int = 0
    disputes_lost: int = 0
    account_created_at: datetime | None = None
    kyc_status: str = "NONE"
    profile_verified: bool = False
    # niche authority
    followers: int | None = None
    engagement_rate: float | None = None
    engagement_source: str | None = None  # PHYLLO | SELF_REPORTED | profile
    audience_interests: dict[str, float] | None = None  # interest name -> share (any scale)
    completed_collab_niches: list[str] = field(default_factory=list)
    # reliability
    milestones_due_submitted: int = 0
    milestones_on_time: int = 0
    milestones_overdue_unsubmitted: int = 0
    milestones_submitted: int = 0
    revisions_total: int = 0
    avg_response_hours: float | None = None
    offer_responses: int = 0
    engaged_deals: int = 0
    creator_cancellations: int = 0


@dataclass
class ScoreResult:
    trust_score: int
    niche_authority: int
    reliability_score: int
    model_version: str
    signals: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "trust_score": self.trust_score,
            "niche_authority": self.niche_authority,
            "reliability_score": self.reliability_score,
            "model_version": self.model_version,
            "signals": self.signals,
        }


class ScoringModel(ABC):
    version: str

    @abstractmethod
    def score(self, data: CreatorScoringInput) -> ScoreResult: ...

    def describe(self) -> dict[str, Any]:
        return {"model_version": self.version}
