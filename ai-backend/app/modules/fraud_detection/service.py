from __future__ import annotations

from datetime import timedelta
from typing import Any
from uuid import UUID

import asyncpg

from app.config import get_settings
from app.modules.fraud_detection import rules
from app.modules.fraud_detection.isolation import PopulationDetector
from app.repositories import creators as creators_repo
from app.repositories import deals as deals_repo
from app.utils.errors import not_found
from app.utils.timeutil import utcnow

_detector: PopulationDetector | None = None


def get_detector() -> PopulationDetector:
    global _detector
    if _detector is None:
        _detector = PopulationDetector(min_population=get_settings().fraud_min_population)
    return _detector


async def analyze_creator(pool: asyncpg.Pool, creator_id: UUID) -> dict[str, Any]:
    profile = await creators_repo.get_creator(pool, creator_id)
    if profile is None:
        raise not_found("Creator", creator_id)
    accounts = [a for a in await creators_repo.get_social_accounts(pool, creator_id) if a["status"] != "DISCONNECTED"]

    if not accounts:
        return {
            "creator_id": str(creator_id), "authenticity_score": None, "risk_level": "insufficient_data",
            "needs_review": False, "flags": [],
            "checks": {"status": "insufficient_data", "reason": "no connected social accounts"},
        }

    snapshots = await creators_repo.get_snapshots(pool, [a["id"] for a in accounts], since=utcnow() - timedelta(days=90))
    platform_by_account = {a["id"]: a["platform"] for a in accounts}

    flags: list[rules.FraudFlag] = []
    flags += rules.low_engagement(accounts)
    growth_flags, growth_checks = rules.growth_rules(snapshots, platform_by_account)
    flags += growth_flags
    bot_flags, bot_status = rules.bot_audience(accounts)
    flags += bot_flags
    flags += rules.engagement_anomaly(accounts)

    population = await creators_repo.population_features(pool)
    forest_info, forest_flags = get_detector().analyze(str(creator_id), population)
    flags += forest_flags

    has_metrics = any(a.get("followers") is not None for a in accounts)
    checks = {
        "LOW_ENGAGEMENT": "checked" if any(a.get("engagement_rate") is not None for a in accounts) else "insufficient_data",
        **growth_checks,
        "BOT_AUDIENCE": bot_status,
        "isolation_forest": forest_info,
        "self_reported_accounts": [a["platform"] for a in accounts if a["source"] == "SELF_REPORTED"],
        "snapshots_considered": len(snapshots),
    }
    if not has_metrics:
        return {"creator_id": str(creator_id), "authenticity_score": None, "risk_level": "insufficient_data",
                "needs_review": False, "flags": [], "checks": checks}

    score, risk, needs_review = rules.authenticity(flags)
    return {
        "creator_id": str(creator_id), "authenticity_score": score, "risk_level": risk,
        "needs_review": needs_review, "flags": [f.to_dict() for f in flags], "checks": checks,
    }


async def analyze_deal(pool: asyncpg.Pool, deal_id: UUID) -> dict[str, Any]:
    facts = await deals_repo.get_deal_fraud_facts(pool, deal_id)
    if facts is None:
        raise not_found("Deal", deal_id)
    s = get_settings()
    flags = rules.deal_rules(facts, s.fraud_high_value_deal_amount, s.fraud_failed_payment_threshold)
    score, risk, needs_review = rules.authenticity(flags)
    return {
        "deal_id": str(deal_id), "authenticity_score": score, "risk_level": risk, "needs_review": needs_review,
        "flags": [f.to_dict() for f in flags],
        "checks": {"failed_intents_deal": facts["failed_intents_deal"],
                   "failed_intents_brand_recent": facts["failed_intents_brand_window"],
                   "amount": facts["amount"], "high_value_threshold": s.fraud_high_value_deal_amount},
    }
