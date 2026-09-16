"""Creator scoring v1: deterministic weighted formulas with min-max normalisation
against fixed, documented bounds. No training data required."""

from __future__ import annotations

import math

from app.models.signals import Signal, insufficient, observed, summarize, weighted_score
from app.modules.creator_scoring.base import CreatorScoringInput, ScoreResult, ScoringModel
from app.utils.benchmarks import benchmark_er
from app.utils.mathx import minmax
from app.utils.niches import canonical_niche, canonical_niches, niche_overlap
from app.utils.timeutil import days_between

KYC_VALUES = {"VERIFIED": 1.0, "PENDING": 0.5, "NONE": 0.25, "REJECTED": 0.0}


def trust_signals(d: CreatorScoringInput) -> list[Signal]:
    s: list[Signal] = []
    # Completed deals: log-scaled, saturates at 25. Zero is an observed value, not missing data.
    s.append(observed("completed_deals", 0.30, d.completed_deals,
                      minmax(math.log1p(d.completed_deals), 0, math.log1p(25))))
    if d.review_count > 0 and d.avg_brand_rating is not None:
        s.append(observed("avg_brand_rating", 0.30, d.avg_brand_rating, minmax(d.avg_brand_rating, 1, 5),
                          detail=f"{d.review_count} brand review(s)"))
    else:
        s.append(insufficient("avg_brand_rating", 0.30, "no brand reviews yet"))
    if d.funded_deals > 0:
        # Lost disputes count double.
        rate = (d.dispute_count + d.disputes_lost) / d.funded_deals
        s.append(observed("disputes", 0.15, {"disputes": d.dispute_count, "lost": d.disputes_lost,
                                              "funded_deals": d.funded_deals},
                          1 - minmax(rate, 0, 0.3)))
    else:
        s.append(insufficient("disputes", 0.15, "no funded deals to measure dispute rate"))
    age = days_between(d.account_created_at)
    if age is not None:
        s.append(observed("account_age_days", 0.10, round(age, 1), minmax(age, 0, 365)))
    else:
        s.append(insufficient("account_age_days", 0.10, "account creation date unknown"))
    kyc = 1.0 if d.profile_verified else KYC_VALUES.get(d.kyc_status, 0.25)
    s.append(observed("kyc", 0.15, "VERIFIED" if d.profile_verified else d.kyc_status, kyc))
    return s


def niche_signals(d: CreatorScoringInput) -> list[Signal]:
    s: list[Signal] = []
    if d.engagement_rate is not None and d.followers:
        bench = benchmark_er(d.followers, d.niches)
        ratio = d.engagement_rate / bench
        detail = f"benchmark {bench:.4f} for tier/niche"
        if d.engagement_source == "SELF_REPORTED":
            detail += "; self-reported metrics (unverified)"
        s.append(observed("engagement_vs_benchmark", 0.50, round(ratio, 3), minmax(ratio, 0.3, 2.0), detail))
    else:
        s.append(insufficient("engagement_vs_benchmark", 0.50, "no engagement data from connected accounts"))

    creator_niches = set(canonical_niches(d.niches))
    if d.audience_interests and creator_niches:
        total = sum(v for v in d.audience_interests.values() if v and v > 0)
        matched = sum(v for k, v in d.audience_interests.items() if v and v > 0 and canonical_niche(k) in creator_niches)
        if total > 0:
            share = matched / total
            s.append(observed("audience_niche_overlap", 0.25, round(share, 4), minmax(share, 0.05, 0.5)))
        else:
            s.append(insufficient("audience_niche_overlap", 0.25, "audience interests present but empty"))
    elif not creator_niches:
        s.append(insufficient("audience_niche_overlap", 0.25, "creator has no niches set"))
    else:
        s.append(insufficient("audience_niche_overlap", 0.25, "no audience demographics (Phyllo) available"))

    if d.completed_collab_niches and d.niches:
        aligned = [niche_overlap(d.niches, [n]) or 0.0 for n in d.completed_collab_niches]
        alignment = sum(aligned) / len(aligned)
        s.append(observed("brand_collab_alignment", 0.25,
                          {"aligned": round(alignment, 3), "completed_collabs": len(aligned)}, alignment))
    else:
        s.append(insufficient("brand_collab_alignment", 0.25, "no completed brief-linked collaborations"))
    return s


def reliability_signals(d: CreatorScoringInput) -> list[Signal]:
    s: list[Signal] = []
    due_total = d.milestones_due_submitted + d.milestones_overdue_unsubmitted
    if due_total > 0:
        rate = d.milestones_on_time / due_total
        s.append(observed("on_time_delivery", 0.40, round(rate, 4), minmax(rate, 0.5, 1.0),
                          detail=f"{d.milestones_on_time}/{due_total} milestones submitted by due date"))
    else:
        s.append(insufficient("on_time_delivery", 0.40, "no milestones with due dates yet"))
    if d.milestones_submitted > 0:
        rev = d.revisions_total / d.milestones_submitted
        s.append(observed("revision_rate", 0.20, round(rev, 4), 1 - minmax(rev, 0, 0.6),
                          detail=f"{d.revisions_total} revision(s) over {d.milestones_submitted} submission(s)"))
    else:
        s.append(insufficient("revision_rate", 0.20, "no submitted milestones yet"))
    if d.avg_response_hours is not None:
        s.append(observed("response_time_hours", 0.20, round(d.avg_response_hours, 2),
                          1 - minmax(d.avg_response_hours, 1, 72)))
    else:
        s.append(insufficient("response_time_hours", 0.20, "no responded offers yet"))
    if d.engaged_deals > 0:
        rate = d.creator_cancellations / d.engaged_deals
        s.append(observed("cancellation_rate", 0.20, round(rate, 4), 1 - minmax(rate, 0, 0.3),
                          detail=f"{d.creator_cancellations} creator cancellation(s) over {d.engaged_deals} deal(s)"))
    else:
        s.append(insufficient("cancellation_rate", 0.20, "no deals beyond the offer stage"))
    return s


class FormulaV1Model(ScoringModel):
    version = "v1-formula"

    def score(self, data: CreatorScoringInput) -> ScoreResult:
        trust = trust_signals(data)
        niche = niche_signals(data)
        reliability = reliability_signals(data)
        return ScoreResult(
            trust_score=weighted_score(trust),
            niche_authority=weighted_score(niche),
            reliability_score=weighted_score(reliability),
            model_version=self.version,
            signals={
                "trust": summarize(trust),
                "niche_authority": summarize(niche),
                "reliability": summarize(reliability),
            },
        )
