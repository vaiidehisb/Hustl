"""Niche taxonomy shared by embeddings, parsing, matching and scoring."""

from __future__ import annotations

import re
from collections.abc import Iterable

CANONICAL_NICHES: tuple[str, ...] = (
    "fashion", "beauty", "fitness", "tech", "food", "travel", "finance",
    "gaming", "education", "family", "lifestyle", "entertainment", "sports", "automotive",
)

# token -> canonical niche (ported from frontend/lib/ai/embed.ts, extended)
NICHE_SYNONYMS: dict[str, str] = {
    "style": "fashion", "apparel": "fashion", "clothing": "fashion", "outfit": "fashion", "streetwear": "fashion",
    "ootd": "fashion", "ethnicwear": "fashion", "jewellery": "fashion", "jewelry": "fashion",
    "makeup": "beauty", "skincare": "beauty", "cosmetics": "beauty", "grooming": "beauty", "haircare": "beauty",
    "gym": "fitness", "workout": "fitness", "health": "fitness", "yoga": "fitness", "nutrition": "fitness",
    "wellness": "fitness",
    "gadgets": "tech", "gadget": "tech", "technology": "tech", "smartphone": "tech", "software": "tech",
    "ai": "tech", "unboxing": "tech", "saas": "tech", "app": "tech",
    "recipes": "food", "recipe": "food", "cooking": "food", "restaurant": "food", "foodie": "food",
    "snacks": "food", "beverage": "food",
    "trip": "travel", "tourism": "travel", "hotel": "travel", "wanderlust": "travel",
    "investing": "finance", "money": "finance", "stocks": "finance", "fintech": "finance", "crypto": "finance",
    "personalfinance": "finance",
    "games": "gaming", "esports": "gaming", "gamer": "gaming", "streaming": "gaming",
    "parenting": "family", "mom": "family", "kids": "family", "baby": "family",
    "edtech": "education", "learning": "education", "study": "education", "career": "education",
    "comedy": "entertainment", "music": "entertainment", "movies": "entertainment", "memes": "entertainment",
    "cricket": "sports", "football": "sports", "athlete": "sports",
    "cars": "automotive", "bikes": "automotive", "auto": "automotive", "ev": "automotive",
    "home": "lifestyle", "decor": "lifestyle", "vlog": "lifestyle",
}

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def canonical_niche(value: str) -> str | None:
    v = value.strip().lower()
    if not v:
        return None
    if v in CANONICAL_NICHES:
        return v
    if v in NICHE_SYNONYMS:
        return NICHE_SYNONYMS[v]
    for tok in _TOKEN_RE.findall(v):
        if tok in CANONICAL_NICHES:
            return tok
        singular = tok[:-1] if len(tok) > 4 and tok.endswith("s") else tok
        if singular in CANONICAL_NICHES:
            return singular
        if tok in NICHE_SYNONYMS:
            return NICHE_SYNONYMS[tok]
    return None


def canonical_niches(values: Iterable[str] | None) -> list[str]:
    out: list[str] = []
    for v in values or []:
        if not isinstance(v, str):
            continue
        c = canonical_niche(v)
        if c and c not in out:
            out.append(c)
    return out


def niche_overlap(creator_niches: Iterable[str] | None, target_niches: Iterable[str] | None) -> float | None:
    """1.0 exact canonical overlap, 0.6 partial text overlap, 0 none. None when target has no niche."""
    targets_raw = [t for t in (target_niches or []) if isinstance(t, str) and t.strip()]
    if not targets_raw:
        return None
    creators_raw = [c for c in (creator_niches or []) if isinstance(c, str) and c.strip()]
    targets = set(canonical_niches(targets_raw))
    creators = set(canonical_niches(creators_raw))
    if targets and creators and targets & creators:
        return 1.0
    low_c = [c.lower() for c in creators_raw]
    for t in (x.lower() for x in targets_raw):
        if any(t in c or c in t for c in low_c):
            return 0.6
    return 0.0
