"""Gather real creator data and run the active scoring model. Read-only: the
creator-data-service persists the returned scores into creator_scores."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any
from uuid import UUID

import asyncpg

from app.modules.creator_scoring.base import CreatorScoringInput
from app.modules.creator_scoring.registry import get_scoring_model
from app.repositories import creators as creators_repo
from app.repositories import deals as deals_repo
from app.utils.benchmarks import normalise_engagement
from app.utils.errors import not_found


def extract_audience_interests(demographics: Any) -> dict[str, float] | None:
    """Accepts Phyllo-style shapes: {"interests": [{"name", "value"|"percentage"}]} or {"interests": {name: share}}."""
    if not isinstance(demographics, Mapping):
        return None
    for key in ("interests", "audience_interests", "top_interests"):
        raw = demographics.get(key)
        if isinstance(raw, Mapping):
            out = {str(k): float(v) for k, v in raw.items() if isinstance(v, (int, float))}
            return out or None
        if isinstance(raw, list):
            out: dict[str, float] = {}
            for item in raw:
                if not isinstance(item, Mapping) or not item.get("name"):
                    continue
                val = item.get("value", item.get("percentage", item.get("weight")))
                if isinstance(val, (int, float)):
                    out[str(item["name"])] = out.get(str(item["name"]), 0.0) + float(val)
            return out or None
    return None


def aggregate_engagement(profile: Mapping[str, Any], accounts: list[Mapping[str, Any]]) -> tuple[int | None, float | None, str | None]:
    live = [a for a in accounts if a.get("status") != "DISCONNECTED"]
    followers = sum(int(a["followers"]) for a in live if a.get("followers")) or None
    weighted = [(a["followers"], normalise_engagement(a["engagement_rate"]), a.get("source"))
                for a in live if a.get("followers") and a.get("engagement_rate") is not None]
    if weighted:
        total = sum(f for f, _, _ in weighted)
        er = sum(f * e for f, e, _ in weighted) / total
        sources = {src for _, _, src in weighted}
        source = "PHYLLO" if sources == {"PHYLLO"} else ("SELF_REPORTED" if "PHYLLO" not in sources else "MIXED")
        return followers, er, source
    if profile.get("engagement_rate") is not None:
        return followers or (profile.get("followers_total") or None), normalise_engagement(profile["engagement_rate"]), "profile"
    return followers or (profile.get("followers_total") or None), None, None


async def build_input(pool: asyncpg.Pool, creator_id: UUID) -> CreatorScoringInput:
    profile = await creators_repo.get_creator(pool, creator_id)
    if profile is None:
        raise not_found("Creator", creator_id)
    accounts = await creators_repo.get_social_accounts(pool, creator_id)
    stats = await deals_repo.creator_delivery_stats(pool, creator_id, profile["user_id"])
    followers, er, er_source = aggregate_engagement(profile, accounts)

    interests: dict[str, float] = {}
    for a in accounts:
        for k, v in (extract_audience_interests(a.get("audience_demographics")) or {}).items():
            interests[k] = interests.get(k, 0.0) + v

    m = stats["milestones"]
    # Prefer offer-response timings computed from deal_offers; fall back to the profile aggregate.
    response_hours = stats["avg_response_hours"] if stats["offer_responses"] else profile.get("avg_response_hours")

    return CreatorScoringInput(
        creator_id=str(creator_id),
        niches=list(profile.get("niches") or []),
        completed_deals=stats["completed_deals"],
        funded_deals=stats["funded_deals"],
        avg_brand_rating=stats["avg_rating"],
        review_count=stats["review_count"],
        dispute_count=stats["dispute_count"],
        disputes_lost=stats["disputes_lost"],
        account_created_at=profile.get("user_created_at"),
        kyc_status=profile.get("kyc_status") or "NONE",
        profile_verified=profile.get("verified_at") is not None,
        followers=followers,
        engagement_rate=er,
        engagement_source=er_source,
        audience_interests=interests or None,
        completed_collab_niches=stats["completed_collab_niches"],
        milestones_due_submitted=int(m.get("due_submitted") or 0),
        milestones_on_time=int(m.get("on_time") or 0),
        milestones_overdue_unsubmitted=int(m.get("overdue_unsubmitted") or 0),
        milestones_submitted=int(m.get("submitted") or 0),
        revisions_total=int(m.get("revisions") or 0),
        avg_response_hours=response_hours,
        offer_responses=stats["offer_responses"],
        engaged_deals=stats["engaged_deals"],
        creator_cancellations=stats["creator_cancellations"],
    )


async def refresh_scores(pool: asyncpg.Pool, creator_id: UUID) -> dict[str, Any]:
    data = await build_input(pool, creator_id)
    result = get_scoring_model().score(data)
    return {"creator_id": str(creator_id), **result.to_dict()}
