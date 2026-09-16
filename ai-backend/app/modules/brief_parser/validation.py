"""Business validation for parser output. LLM JSON is never trusted: values are
normalised where the mapping is unambiguous, then strictly validated with
Pydantic (negative budgets, unknown enums, bad dates are rejected)."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date
from typing import Any

from pydantic import ValidationError

from app.modules.brief_parser.schema import CONFIDENCE_FIELDS, PLATFORMS, ParsedBrief
from app.utils.niches import canonical_niche

PLATFORM_ALIASES = {
    "instagram": "INSTAGRAM", "insta": "INSTAGRAM", "ig": "INSTAGRAM",
    "youtube": "YOUTUBE", "yt": "YOUTUBE", "youtube shorts": "YOUTUBE",
    "tiktok": "TIKTOK", "tik tok": "TIKTOK",
    "linkedin": "LINKEDIN",
    "x": "X", "twitter": "X", "x (twitter)": "X",
}


class BriefValidationError(ValueError):
    def __init__(self, message: str, errors: list[dict[str, Any]] | None = None) -> None:
        super().__init__(message)
        self.errors = errors or []


def normalise_platform(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    v = value.strip()
    if v.upper() in PLATFORMS:
        return v.upper()
    return PLATFORM_ALIASES.get(v.lower())


def _clean_strings(values: Any, max_len: int = 200) -> list[str]:
    if not isinstance(values, list):
        return []
    out = []
    for v in values:
        if isinstance(v, str) and v.strip():
            s = " ".join(v.split())[:max_len]
            if s not in out:
                out.append(s)
    return out


def validate_parsed(raw: Mapping[str, Any], today: date | None = None) -> tuple[ParsedBrief, list[str]]:
    """Normalise + validate a parser payload. Raises BriefValidationError when invalid."""
    if not isinstance(raw, Mapping):
        raise BriefValidationError("parser output is not an object")
    warnings: list[str] = []
    data = dict(raw)
    confidence = dict(data.get("confidence") or {}) if isinstance(data.get("confidence"), Mapping) else {}

    # platforms: map aliases, drop unknowns (and lower confidence) rather than trusting them
    platforms, dropped = [], []
    for p in data.get("platforms") or []:
        n = normalise_platform(p)
        (platforms.append(n) if n else dropped.append(p))
    if dropped:
        warnings.append(f"dropped unsupported platform(s): {dropped}")
        confidence["platforms"] = "low"
    data["platforms"] = list(dict.fromkeys(platforms))

    niches, dropped = [], []
    for n in data.get("niche") or []:
        c = canonical_niche(n) if isinstance(n, str) else None
        (niches.append(c) if c else dropped.append(n))
    if dropped:
        warnings.append(f"dropped unknown niche(s): {dropped}")
        confidence["niche"] = "low"
    data["niche"] = list(dict.fromkeys(niches))

    for key in ("audience", "requirements", "location"):
        data[key] = _clean_strings(data.get(key))
    if isinstance(data.get("title"), str):
        data["title"] = " ".join(data["title"].split())[:120]
    if isinstance(data.get("timeline"), str):
        data["timeline"] = " ".join(data["timeline"].split())[:200]

    budget = data.get("budget")
    if isinstance(budget, Mapping):
        budget = dict(budget)
        if isinstance(budget.get("currency"), str):
            budget["currency"] = budget["currency"].strip().upper() or "INR"
        elif budget.get("currency") is None:
            budget["currency"] = "INR"
        data["budget"] = budget

    data["confidence"] = {k: v for k, v in confidence.items() if k in CONFIDENCE_FIELDS}

    try:
        parsed = ParsedBrief.model_validate(data)
    except ValidationError as exc:
        errors = [{"loc": list(e["loc"]), "msg": e["msg"]} for e in exc.errors()]
        raise BriefValidationError("parser output failed validation", errors) from exc

    # Soft business checks: keep the value, but say so and lower confidence.
    conf = dict(parsed.confidence)
    today = today or date.today()
    if parsed.deadline and parsed.deadline < today:
        warnings.append(f"deadline {parsed.deadline.isoformat()} is in the past")
        conf["deadline"] = "low"
    b = parsed.budget
    if b.total is not None and b.per_creator is not None and parsed.creators_needed:
        if b.total < b.per_creator * parsed.creators_needed:
            warnings.append("total budget is less than per-creator budget x creators needed")
            conf["budget"] = "low"
    if b.per_creator == 0:
        warnings.append("per-creator budget is 0")
        conf["budget"] = "low"
    parsed.confidence = {k: conf.get(k, "low") for k in CONFIDENCE_FIELDS}  # type: ignore[assignment]
    return parsed, warnings
