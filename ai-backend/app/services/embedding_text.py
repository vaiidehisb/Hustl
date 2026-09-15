"""Build embedding input text from real profile / brief rows."""

from __future__ import annotations

import hashlib
from collections.abc import Iterable, Mapping
from typing import Any


def _strs(values: Iterable[Any] | None) -> list[str]:
    return [str(v).strip() for v in (values or []) if v is not None and str(v).strip()]


def _json_list(value: Any) -> list[Mapping[str, Any]]:
    return [v for v in value if isinstance(v, Mapping)] if isinstance(value, list) else []


def creator_text(profile: Mapping[str, Any], social_accounts: Iterable[Mapping[str, Any]] = ()) -> str:
    niches = _strs(profile.get("niches"))
    platforms = sorted({str(a["platform"]).lower() for a in social_accounts if a.get("platform")})
    portfolio = _json_list(profile.get("portfolio"))
    rate_card = _json_list(profile.get("rate_card"))
    parts = [
        profile.get("headline") or "",
        profile.get("bio") or "",
        " ".join(niches),
        " ".join(niches),  # niches weighted twice, as in the TS prototype
        " ".join(platforms),
        " ".join(_strs(profile.get("languages"))),
        profile.get("location") or "",
        " ".join(_strs(p.get("title") for p in portfolio)),
        " ".join(_strs(p.get("brand") for p in portfolio)),
        " ".join(_strs(r.get("deliverable") for r in rate_card)),
    ]
    return " ".join(p for p in parts if p).strip()


def brief_text(brief: Mapping[str, Any]) -> str:
    niche = brief.get("niche") or ""
    deliverables = _json_list(brief.get("deliverables"))
    parts = [
        brief.get("title") or "",
        brief.get("description") or "",
        brief.get("requirements") or "",
        niche,
        niche,
        " ".join(str(p).lower() for p in (brief.get("platforms") or [])),
        brief.get("audience") or "",
        " ".join(_strs(d.get("type") for d in deliverables)),
    ]
    return " ".join(p for p in parts if p).strip()


def content_hash(model: str, text: str) -> str:
    return hashlib.sha256(f"{model}\n{text}".encode("utf-8")).hexdigest()
