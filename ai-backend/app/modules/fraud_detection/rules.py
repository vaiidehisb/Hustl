"""Explainable fraud rules. Flags are advisory — nothing here bans anyone."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import asdict, dataclass, field
from datetime import timedelta
from typing import Any

from app.utils.benchmarks import normalise_engagement, tier_benchmark_er
from app.utils.timeutil import as_utc, days_between

SEVERITY_PENALTY = {"HIGH": 30, "MEDIUM": 15, "LOW": 5}


@dataclass
class FraudFlag:
    code: str
    label: str
    severity: str  # LOW | MEDIUM | HIGH
    source: str = "RULE"  # RULE | ISOLATION_FOREST
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ── Creator rules ────────────────────────────────────────────────────────────

def low_engagement(accounts: Iterable[Mapping[str, Any]]) -> list[FraudFlag]:
    flags = []
    for a in accounts:
        followers, er = a.get("followers"), normalise_engagement(a.get("engagement_rate"))
        if followers and er is not None and followers >= 100_000 and er < 0.005:
            flags.append(FraudFlag(
                "LOW_ENGAGEMENT", "Engagement under 0.5% on a 100K+ audience", "HIGH",
                details={"platform": a.get("platform"), "followers": followers, "engagement_rate": er,
                         "tier_benchmark": tier_benchmark_er(followers), "data_source": a.get("source")},
            ))
    return flags


def _series_by_account(snapshots: Iterable[Mapping[str, Any]]) -> dict[Any, list[Mapping[str, Any]]]:
    series: dict[Any, list[Mapping[str, Any]]] = defaultdict(list)
    for s in snapshots:
        if s.get("followers") is not None and s.get("captured_at") is not None:
            series[s["social_account_id"]].append(s)
    for rows in series.values():
        rows.sort(key=lambda r: as_utc(r["captured_at"]))
    return series


def growth_rules(
    snapshots: Iterable[Mapping[str, Any]],
    platform_by_account: Mapping[Any, str] | None = None,
    window_days: int = 7,
    growth_threshold: float = 0.30,
    spike_threshold: float = 0.20,
) -> tuple[list[FraudFlag], dict[str, str]]:
    """SUSPICIOUS_GROWTH: >30% follower growth inside any 7-day window.
    FOLLOWER_SPIKE: >20% jump between two consecutive syncs."""
    platform_by_account = platform_by_account or {}
    flags: list[FraudFlag] = []
    checks = {"SUSPICIOUS_GROWTH": "insufficient_data", "FOLLOWER_SPIKE": "insufficient_data"}
    window = timedelta(days=window_days)

    for account_id, rows in _series_by_account(snapshots).items():
        if len(rows) < 2:
            continue
        checks["FOLLOWER_SPIKE"] = "checked"
        platform = platform_by_account.get(account_id)

        best_spike = None
        for prev, cur in zip(rows, rows[1:]):
            if prev["followers"] > 0:
                jump = (cur["followers"] - prev["followers"]) / prev["followers"]
                if jump > spike_threshold and (best_spike is None or jump > best_spike[0]):
                    best_spike = (jump, prev, cur)
        if best_spike:
            jump, prev, cur = best_spike
            flags.append(FraudFlag(
                "FOLLOWER_SPIKE", "Follower count jumped more than 20% between syncs",
                "HIGH" if jump > 0.5 else "MEDIUM",
                details={"platform": platform, "from_followers": prev["followers"], "to_followers": cur["followers"],
                         "change": round(jump, 4), "from": as_utc(prev["captured_at"]).isoformat(),
                         "to": as_utc(cur["captured_at"]).isoformat()},
            ))

        best_growth = None
        start = 0
        for end in range(len(rows)):
            end_ts = as_utc(rows[end]["captured_at"])
            while as_utc(rows[start]["captured_at"]) < end_ts - window:
                start += 1
            if end == start:
                continue
            # the window has at least two points: account has growth data
            checks["SUSPICIOUS_GROWTH"] = "checked"
            base = min(rows[start:end], key=lambda r: r["followers"])
            if base["followers"] > 0:
                g = (rows[end]["followers"] - base["followers"]) / base["followers"]
                if g > growth_threshold and (best_growth is None or g > best_growth[0]):
                    best_growth = (g, base, rows[end])
        if best_growth:
            g, base, cur = best_growth
            flags.append(FraudFlag(
                "SUSPICIOUS_GROWTH", f"Follower growth above 30% within {window_days} days",
                "HIGH" if g > 1.0 else "MEDIUM",
                details={"platform": platform, "from_followers": base["followers"], "to_followers": cur["followers"],
                         "growth": round(g, 4), "window_days": window_days,
                         "from": as_utc(base["captured_at"]).isoformat(), "to": as_utc(cur["captured_at"]).isoformat()},
            ))
    return flags, checks


def _pct(v: Any) -> float | None:
    if not isinstance(v, (int, float)):
        return None
    return float(v) / 100.0 if v > 1 else float(v)


def bot_audience(accounts: Iterable[Mapping[str, Any]]) -> tuple[list[FraudFlag], str]:
    """Uses Phyllo audience data when present: follower_types (suspicious / mass followers) and credibility."""
    flags: list[FraudFlag] = []
    status = "insufficient_data"
    for a in accounts:
        demo = a.get("audience_demographics")
        if not isinstance(demo, Mapping) or a.get("source") != "PHYLLO":
            continue
        suspicious = None
        types = demo.get("follower_types") or demo.get("audience_types")
        if isinstance(types, list):
            vals = {str(t.get("name", "")).lower(): _pct(t.get("value", t.get("percentage")))
                    for t in types if isinstance(t, Mapping)}
            parts = [v for k, v in vals.items() if v is not None and k in {"suspicious", "mass_followers", "bots", "fake"}]
            if parts:
                suspicious = sum(parts)
        for key in ("suspicious_followers_percentage", "fake_followers_percentage", "bot_percentage"):
            if suspicious is None and key in demo:
                suspicious = _pct(demo.get(key))
        credibility = _pct(demo.get("credibility_score", demo.get("audience_credibility")))
        if suspicious is None and credibility is None:
            continue
        status = "checked"
        details = {"platform": a.get("platform"), "suspicious_share": suspicious, "credibility": credibility}
        if (suspicious is not None and suspicious > 0.5) or (credibility is not None and credibility < 0.4):
            flags.append(FraudFlag("BOT_AUDIENCE", "Large share of suspicious or bot-like followers", "HIGH", details=details))
        elif (suspicious is not None and suspicious > 0.3) or (credibility is not None and credibility < 0.6):
            flags.append(FraudFlag("BOT_AUDIENCE", "Elevated share of suspicious or bot-like followers", "MEDIUM", details=details))
    return flags, status


def engagement_anomaly(accounts: Iterable[Mapping[str, Any]]) -> list[FraudFlag]:
    """Engagement far above tier benchmark (possible pods / bought engagement)."""
    flags = []
    for a in accounts:
        followers, er = a.get("followers"), normalise_engagement(a.get("engagement_rate"))
        if followers and followers >= 10_000 and er is not None and er / tier_benchmark_er(followers) > 4:
            flags.append(FraudFlag(
                "ER_ANOMALY", "Engagement far above tier benchmark (possible engagement pods)", "LOW",
                details={"platform": a.get("platform"), "followers": followers, "engagement_rate": er,
                         "tier_benchmark": tier_benchmark_er(followers)},
            ))
    return flags


# ── Deal rules ───────────────────────────────────────────────────────────────

def deal_rules(facts: Mapping[str, Any], high_value_amount: int, failed_payment_threshold: int) -> list[FraudFlag]:
    flags: list[FraudFlag] = []
    amount = int(facts.get("amount") or 0)
    brand_age = days_between(facts.get("brand_user_created_at"), facts.get("created_at"))
    if brand_age is not None and brand_age < 7 and amount >= high_value_amount:
        flags.append(FraudFlag(
            "NEW_ACCOUNT_HIGH_VALUE", "Brand account under 7 days old posting a high-value deal", "MEDIUM",
            details={"account_age_days": round(brand_age, 2), "amount": amount, "currency": facts.get("currency"),
                     "threshold": high_value_amount},
        ))
    failed_deal = int(facts.get("failed_intents_deal") or 0)
    failed_brand = int(facts.get("failed_intents_brand_window") or 0)
    if failed_deal >= failed_payment_threshold or failed_brand >= failed_payment_threshold:
        flags.append(FraudFlag(
            "REPEATED_PAYMENT_FAILURES", "Repeated failed payment attempts",
            "HIGH" if max(failed_deal, failed_brand) >= 2 * failed_payment_threshold else "MEDIUM",
            details={"failed_on_deal": failed_deal, "failed_for_brand_recent": failed_brand,
                     "window_days": facts.get("failure_window_days"), "threshold": failed_payment_threshold},
        ))
    if facts.get("brand_user_id") and facts.get("brand_user_id") == facts.get("creator_user_id"):
        flags.append(FraudFlag(
            "SELF_DEALING", "Brand and creator are the same user", "HIGH",
            details={"user_id": str(facts["brand_user_id"])},
        ))
    return flags


# ── Aggregation ──────────────────────────────────────────────────────────────

def authenticity(flags: list[FraudFlag]) -> tuple[int, str, bool]:
    penalty = sum(SEVERITY_PENALTY.get(f.severity, 0) for f in flags)
    score = max(0, min(100, 100 - penalty))
    risk = "LOW" if score >= 80 else "MEDIUM" if score >= 60 else "HIGH"
    return score, risk, score < 60
