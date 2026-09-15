from datetime import datetime, timedelta, timezone

import numpy as np

from app.modules.fraud_detection import rules
from app.modules.fraud_detection.isolation import PopulationDetector

T0 = datetime(2026, 9, 1)  # naive, as Prisma stores it


def snap(acc, days, followers):
    return {"social_account_id": acc, "followers": followers, "captured_at": T0 + timedelta(days=days)}


def test_low_engagement_rule():
    flags = rules.low_engagement([
        {"platform": "INSTAGRAM", "followers": 250_000, "engagement_rate": 0.003, "source": "PHYLLO"},
        {"platform": "YOUTUBE", "followers": 50_000, "engagement_rate": 0.001},  # under 100K: not flagged
        {"platform": "X", "followers": 500_000, "engagement_rate": None},  # no data: not flagged
    ])
    assert [f.code for f in flags] == ["LOW_ENGAGEMENT"] and flags[0].severity == "HIGH"


def test_suspicious_growth_within_seven_days():
    flags, checks = rules.growth_rules([snap("a", 0, 10_000), snap("a", 3, 11_000), snap("a", 6, 14_000)], {"a": "INSTAGRAM"})
    codes = {f.code for f in flags}
    assert "SUSPICIOUS_GROWTH" in codes
    assert "FOLLOWER_SPIKE" in codes  # 11k -> 14k is +27% between syncs
    assert checks == {"SUSPICIOUS_GROWTH": "checked", "FOLLOWER_SPIKE": "checked"}


def test_slow_growth_spread_over_months_is_not_flagged():
    snaps = [snap("a", d, int(10_000 * (1.01 ** (d / 7)))) for d in range(0, 120, 7)]
    flags, _ = rules.growth_rules(snaps)
    assert flags == []


def test_growth_rules_report_insufficient_data_for_single_snapshot():
    flags, checks = rules.growth_rules([snap("a", 0, 10_000)])
    assert flags == [] and checks["SUSPICIOUS_GROWTH"] == "insufficient_data"


def test_bot_audience_requires_phyllo_data():
    phyllo = {"platform": "INSTAGRAM", "source": "PHYLLO", "audience_demographics": {
        "follower_types": [{"name": "real", "value": 40}, {"name": "suspicious", "value": 35}, {"name": "mass_followers", "value": 25}]}}
    flags, status = rules.bot_audience([phyllo])
    assert status == "checked" and flags[0].code == "BOT_AUDIENCE" and flags[0].severity == "HIGH"
    self_reported = {**phyllo, "source": "SELF_REPORTED"}
    assert rules.bot_audience([self_reported]) == ([], "insufficient_data")


def test_deal_rules():
    now = datetime(2026, 9, 10)
    facts = {"amount": 200_000, "currency": "INR", "created_at": now, "brand_user_created_at": now - timedelta(days=2),
             "brand_user_id": "u1", "creator_user_id": "u1", "failed_intents_deal": 3,
             "failed_intents_brand_window": 4, "failure_window_days": 7}
    flags = rules.deal_rules(facts, high_value_amount=50_000, failed_payment_threshold=3)
    assert {f.code for f in flags} == {"NEW_ACCOUNT_HIGH_VALUE", "REPEATED_PAYMENT_FAILURES", "SELF_DEALING"}
    score, risk, review = rules.authenticity(flags)
    assert score == 100 - 15 - 15 - 30 and risk == "HIGH" and review is True

    clean = {**facts, "brand_user_created_at": now - timedelta(days=400), "creator_user_id": "u2",
             "failed_intents_deal": 0, "failed_intents_brand_window": 1}
    assert rules.deal_rules(clean, 50_000, 3) == []
    assert rules.authenticity([]) == (100, "LOW", False)


def _population(n, rng):
    rows = []
    for i in range(n):
        f = float(rng.lognormal(10, 0.8))
        rows.append({"creator_id": f"c{i}", "followers": f, "avg_likes": f * 0.03, "avg_comments": f * 0.002,
                     "growth": float(rng.normal(0.02, 0.01))})
    return rows


def test_isolation_forest_needs_population():
    rng = np.random.default_rng(0)
    info, flags = PopulationDetector(min_population=50).analyze("c0", _population(20, rng))
    assert info["model"] == "insufficient_population" and flags == []


def test_isolation_forest_flags_obvious_outlier():
    rng = np.random.default_rng(1)
    rows = _population(80, rng)
    rows.append({"creator_id": "bot", "followers": 2_000_000.0, "avg_likes": 40.0, "avg_comments": 0.0, "growth": 3.0})
    det = PopulationDetector(min_population=50)
    info, flags = det.analyze("bot", rows)
    assert info["model"] == "isolation_forest"
    assert flags and flags[0].code == "METRICS_OUTLIER" and flags[0].source == "ISOLATION_FOREST"
    info2, _ = det.analyze("missing", rows)
    assert info2["status"] == "creator_has_no_metrics"
