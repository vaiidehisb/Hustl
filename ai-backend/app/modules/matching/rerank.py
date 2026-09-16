"""Module 1 re-ranking: semantic 40%, engagement fit 20%, follower fit 15%,
reliability 15%, availability 10%. Disqualified creators are penalised and
ranked after qualified ones."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from app.models.features import BriefCriteria, CandidateCreator
from app.models.signals import observed, weighted_score
from app.modules.matching import features as F

WEIGHTS = {"semantic": 0.40, "engagement_fit": 0.20, "follower_fit": 0.15, "reliability": 0.15, "availability": 0.10}
DISQUALIFIER_PENALTY = 10


def score_candidate(c: CandidateCreator, b: BriefCriteria) -> dict[str, Any]:
    sem, niche = F.semantic(c, b, WEIGHTS["semantic"])
    signals = [
        sem,
        F.engagement_fit(c, b, WEIGHTS["engagement_fit"]),
        F.follower_fit(c, b, WEIGHTS["follower_fit"]),
        F.reliability(c, WEIGHTS["reliability"]),
        observed("availability", WEIGHTS["availability"], c.available, 1.0 if c.available else 0.0),
    ]
    disqualifiers = F.hard_disqualifiers(c, b)
    raw = weighted_score(signals)
    score = max(0, raw - DISQUALIFIER_PENALTY * len(disqualifiers))
    sim_norm = sem.normalized if sem.status == "ok" else None
    return {
        "creator_id": c.creator_id,
        "match_score": score,
        "match_reasons": F.reasons(c, b, niche, sim_norm)[:3],
        "disqualifiers": disqualifiers,
        "components": {
            s.name: {"score": round(s.normalized, 4), "weight": s.weight, "status": s.status,
                     **({"value": s.to_dict()["value"]} if s.value is not None else {}),
                     **({"detail": s.detail} if s.detail else {})}
            for s in signals
        },
    }


def rerank(candidates: Sequence[CandidateCreator], brief: BriefCriteria, limit: int = 20) -> list[dict[str, Any]]:
    scored = [score_candidate(c, brief) for c in candidates]
    scored.sort(key=lambda r: (len(r["disqualifiers"]) > 0, -r["match_score"], r["creator_id"]))
    return scored[:limit]
