"""Module 5: application scoring. Hard requirements first (disqualifiers), then
semantic 35% + structured features 40% + reliability 25%."""

from __future__ import annotations

from typing import Any

from app.models.features import BriefCriteria, CandidateCreator
from app.models.signals import insufficient, observed, weighted_score
from app.modules.matching import features as F
from app.utils.mathx import clamp, minmax

MODEL_VERSION = "v1-formula"
WEIGHTS = {"semantic": 0.35, "structured": 0.40, "reliability": 0.25}
DISQUALIFIER_PENALTY = 10


def structured_features(c: CandidateCreator, b: BriefCriteria, proposed_rate: int | None) -> dict[str, float]:
    feats: dict[str, float] = {}
    fol = F.follower_fit(c, b, 1.0)
    if fol.status == "ok":
        feats["followers"] = fol.normalized
    er = F.engagement_fit(c, b, 1.0)
    if er.status == "ok":
        feats["engagement"] = er.normalized
    cov = F.platform_coverage(c, b)
    if cov is not None:
        feats["platforms"] = cov
    if b.niche:
        from app.utils.niches import niche_overlap

        ov = niche_overlap(c.niches, [b.niche])
        if ov is not None:
            feats["niche"] = ov
    if proposed_rate and b.budget_per_creator:
        feats["rate_within_budget"] = clamp(b.budget_per_creator / proposed_rate)
    loc = F.location_match(c, b)
    if loc is not None:
        feats["location"] = loc
    return feats


def score_application(
    c: CandidateCreator,
    b: BriefCriteria,
    pitch_similarity: float | None = None,
    proposed_rate: int | None = None,
) -> dict[str, Any]:
    # Applications are accepted regardless of the availability toggle, so it is not a hard requirement here.
    disqualifiers = F.hard_disqualifiers(c, b, check_availability=False)

    sem, niche = F.semantic(c, b, WEIGHTS["semantic"])
    if pitch_similarity is not None and sem.status == "ok":
        pitch_norm = minmax(pitch_similarity, F.SIM_FLOOR, F.SIM_CEIL)
        blended = 0.7 * sem.normalized + 0.3 * pitch_norm
        sem = observed("semantic", WEIGHTS["semantic"], {**(sem.value or {}), "pitch_cosine": round(pitch_similarity, 4)},
                       blended)

    feats = structured_features(c, b, proposed_rate)
    if feats:
        structured = observed("structured", WEIGHTS["structured"], {k: round(v, 4) for k, v in feats.items()},
                              sum(feats.values()) / len(feats))
    else:
        structured = insufficient("structured", WEIGHTS["structured"], "no structured creator/brief data")

    signals = [sem, structured, F.reliability(c, WEIGHTS["reliability"])]
    score = max(0, weighted_score(signals) - DISQUALIFIER_PENALTY * len(disqualifiers))
    sim_norm = sem.normalized if sem.status == "ok" else None
    reasons = F.reasons(c, b, niche, sim_norm)
    if proposed_rate and b.budget_per_creator and proposed_rate <= b.budget_per_creator:
        reasons.append("Proposed rate within budget")
    return {
        "match_score": score,
        "match_reasons": reasons[:3],
        "disqualifiers": disqualifiers,
        "components": {s.name: s.to_dict() for s in signals},
        "model_version": MODEL_VERSION,
    }
