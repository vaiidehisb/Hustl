"""Deterministic rule-based brief parser (fallback when Claude is unavailable).
Ported from frontend/lib/ai/brief-parser.ts and extended to the full output shape.
Never invents values: anything not found is empty/None with low confidence."""

from __future__ import annotations

import re
from datetime import date
from typing import Any

from app.utils.niches import CANONICAL_NICHES, NICHE_SYNONYMS

NUM_WORDS = {"a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
             "eight": 8, "nine": 9, "ten": 10, "single": 1, "couple": 2}
_NUM = r"(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|single)"
MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
          "november", "december"]
_MONTH_RE = r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"

KNOWN_LOCATIONS = [
    "Mumbai", "Delhi", "New Delhi", "NCR", "Gurgaon", "Gurugram", "Noida", "Bangalore", "Bengaluru", "Hyderabad",
    "Chennai", "Kolkata", "Pune", "Ahmedabad", "Jaipur", "Lucknow", "Chandigarh", "Kochi", "Goa", "Indore",
    "Surat", "Bhopal", "Nagpur", "Coimbatore", "Tier 2", "Tier-2", "Pan-India", "Pan India", "India", "UAE",
    "Dubai", "Singapore", "USA", "UK",
]

PLATFORM_PATTERNS: list[tuple[str, str, str]] = [
    ("INSTAGRAM", r"\b(instagram|insta)\b", "high"),
    ("INSTAGRAM", r"\b(ig|reels?|stor(?:y|ies))\b", "medium"),
    ("YOUTUBE", r"\byoutube\b", "high"),
    ("YOUTUBE", r"\b(yt|shorts?)\b", "medium"),
    ("TIKTOK", r"\btik\s?tok\b", "high"),
    ("LINKEDIN", r"\blinkedin\b", "high"),
    ("X", r"\b(twitter|tweets?|x\.com)\b|\bon x\b", "high"),
]

DELIVERABLE_PATTERNS: list[tuple[str, str]] = [
    (rf"{_NUM}\s+(?:instagram\s+|ig\s+)?reels?\b", "Reel"),
    (rf"{_NUM}\s+(?:instagram\s+|ig\s+)?stor(?:y|ies)\b", "Story"),
    (rf"{_NUM}\s+(?:dedicated\s+|integrated\s+)?(?:youtube\s+|yt\s+)?videos?\b", "YouTube video"),
    (rf"{_NUM}\s+(?:youtube\s+)?shorts?\b", "Short"),
    (rf"{_NUM}\s+(?:instagram\s+|linkedin\s+|carousel\s+|static\s+)?posts?\b", "Post"),
    (rf"{_NUM}\s+(?:tweets?|threads?)\b", "Tweet"),
    (rf"{_NUM}\s+(?:live\s+streams?|lives?)\b", "Live"),
    (rf"{_NUM}\s+blogs?(?:\s+posts?)?\b", "Blog"),
]


def _num(token: str) -> int | None:
    token = token.lower()
    if token in NUM_WORDS:
        return NUM_WORDS[token]
    try:
        return int(token)
    except ValueError:
        return None


def _amount(raw: str, unit: str | None) -> int:
    n = float(raw.replace(",", ""))
    u = (unit or "").lower()
    if u in {"k", "thousand"}:
        n *= 1_000
    elif u in {"l", "lakh", "lakhs", "lac", "lacs"}:
        n *= 100_000
    elif u in {"cr", "crore", "crores"}:
        n *= 10_000_000
    elif u in {"m", "mn", "million"}:
        n *= 1_000_000
    return int(round(n))


def _niches(t: str) -> tuple[list[str], str]:
    found: list[tuple[int, str, bool]] = []
    for m in re.finditer(r"[a-z0-9]+", t):
        tok = m.group(0)
        if tok in CANONICAL_NICHES:
            found.append((m.start(), tok, True))
        elif tok in NICHE_SYNONYMS and tok not in {"app", "home", "ai", "auto", "vlog", "streaming", "money"}:
            found.append((m.start(), NICHE_SYNONYMS[tok], False))
    ordered: list[str] = []
    explicit = False
    for _, niche, is_explicit in sorted(found):
        explicit |= is_explicit
        if niche not in ordered:
            ordered.append(niche)
    if not ordered:
        return [], "low"
    return ordered[:3], "high" if explicit else "medium"


def _platforms(t: str) -> tuple[list[str], str]:
    out: list[str] = []
    conf = "low"
    for platform, pattern, level in PLATFORM_PATTERNS:
        if re.search(pattern, t) and platform not in out:
            out.append(platform)
            conf = "high" if level == "high" or conf == "high" else "medium"
    return out, conf


def _deliverables(t: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for pattern, typ in DELIVERABLE_PATTERNS:
        qty = 0
        for m in re.finditer(pattern, t):
            n = _num(m.group(1))
            if n:
                qty += n
        if qty:
            out.append({"type": typ, "quantity": min(qty, 100)})
    return out


def _budget(t: str, creators_needed: int | None) -> tuple[dict[str, Any], str]:
    currency = "USD" if re.search(r"(\$|\busd\b|dollars?)", t) and not re.search(r"(₹|\brs\.?|\binr\b|rupees?)", t) else "INR"
    pattern = re.compile(
        r"(?:budget(?:\s+(?:is|of))?|₹|\brs\.?|\binr\b|\$|\busd\b|pay(?:ing)?)\s*[:\-]?\s*(?:of\s*)?(?:₹|rs\.?|inr|\$|usd)?\s*"
        r"(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|l|lakhs?|lacs?|cr|crores?|m|mn|million)?\b"
    )
    per_creator = total = None
    conf = "low"
    for m in pattern.finditer(t):
        value = _amount(m.group(1), m.group(2))
        # Context is clipped to the current sentence so "each." from a previous sentence doesn't leak in.
        tail = re.split(r"[.!?\n;](?!\d)", t[m.end(): m.end() + 30], maxsplit=1)[0]
        head = re.split(r"[.!?\n;](?!\d)", t[max(0, m.start() - 25): m.start()])[-1]
        context = f"{head} {m.group(0)} {tail}"
        if re.search(r"\b(total|overall|in total|entire|campaign budget)\b", context):
            total = value
            conf = "high" if conf == "high" else "medium"
        elif re.search(r"(per|each|/)\s*(creator|influencer|person)|\beach\b", context):
            per_creator, conf = value, "high"
        elif per_creator is None and total is None:
            per_creator, conf = value, "medium"
    if per_creator is None and total is not None and creators_needed:
        per_creator = total // creators_needed
        conf = "medium"
    return {"per_creator": per_creator, "currency": currency, "total": total}, conf


def _creators_needed(t: str) -> int | None:
    m = re.search(rf"{_NUM}\s+(?:\w+\s+){{0,2}}(?:creators|influencers|creator|influencer)\b", t)
    if m:
        n = _num(m.group(1))
        if n and n <= 1000 and not re.match(r"\d+\s*k", t[m.start():m.end()]):
            return n
    return None


def _min_followers(t: str) -> int | None:
    unit = r"(k|m|l|lakhs?|mn|million)?"
    for pattern in (
        rf"(\d+(?:\.\d+)?)\s*{unit}\s*\+?\s*followers",
        rf"followers\s*(?:of|above|over|more than|at least|>=?|min(?:imum)?)\s*(\d+(?:\.\d+)?)\s*{unit}",
        rf"(?:at least|minimum|min\.?|over|above)\s*(\d+(?:\.\d+)?)\s*{unit}\s*\+?\s*(?:followers|subs|subscribers)",
    ):
        m = re.search(pattern, t)
        if m:
            return _amount(m.group(1), m.group(2))
    return None


def _month_index(token: str) -> int:
    token = token.lower()[:3]
    return [mm[:3] for mm in MONTHS].index(token) + 1


def _deadline(t: str, today: date) -> tuple[date | None, str]:
    iso = re.search(r"\b(20\d{2})-(\d{2})-(\d{2})\b", t)
    if iso:
        try:
            return date(int(iso.group(1)), int(iso.group(2)), int(iso.group(3))), "high"
        except ValueError:
            pass
    patterns = (
        (rf"(?:by|before|deadline|due|until|till|on)\s*:?\s*(\d{{1,2}})(?:st|nd|rd|th)?\s+(?:of\s+)?{_MONTH_RE},?\s*(20\d{{2}})?", "dm"),
        (rf"(?:by|before|deadline|due|until|till|on)\s*:?\s*{_MONTH_RE}\s+(\d{{1,2}})(?:st|nd|rd|th)?,?\s*(20\d{{2}})?", "md"),
    )
    for pattern, order in patterns:
        m = re.search(pattern, t)
        if not m:
            continue
        if order == "dm":
            day, month, year = int(m.group(1)), _month_index(m.group(2)), m.group(3)
        else:
            month, day, year = _month_index(m.group(1)), int(m.group(2)), m.group(3)
        try:
            if year:
                return date(int(year), month, day), "high"
            candidate = date(today.year, month, day)
            if candidate < today:
                candidate = date(today.year + 1, month, day)
            return candidate, "medium"
        except ValueError:
            continue
    return None, "low"


def _timeline(t: str) -> tuple[str, str]:
    patterns = [
        rf"(?:in|by|during|before|over|within|across)\s+((?:early |mid[- ]|late |end of )?{_MONTH_RE}(?:\s+20\d{{2}})?)",
        r"((?:next|this|coming)\s+(?:week|month|quarter))",
        r"(\d+\s*(?:-|to)?\s*\d*\s*(?:weeks?|days?|months?))",
        r"\b(q[1-4](?:\s+20\d{2})?)\b",
        r"\b(diwali|holi|christmas|new year|valentine'?s day|independence day|monsoon|summer|winter|festive season)\b",
    ]
    for p in patterns:
        m = re.search(p, t)
        if m:
            return m.group(1).strip(), "high" if "20" in m.group(1) or re.search(r"week|day|month|q\d", m.group(1)) else "medium"
    return "", "low"


def _audience(text: str, t: str) -> list[str]:
    out: list[str] = []
    m = re.search(r"(?:target(?:ing)?\s+audience|audience|targeting|aimed at|for)\s*(?:is|of|:)?\s*([^.\n;]{3,80})", t)
    if m and re.search(r"audience|targeting|aimed at", m.group(0)):
        out.extend(s.strip() for s in re.split(r",| and ", m.group(1)) if s.strip())
    for age in re.findall(r"\b(\d{2})\s*(?:-|to)\s*(\d{2})\b(?:\s*(?:year|yrs|y/o|age))?", t):
        if 13 <= int(age[0]) < int(age[1]) <= 80:
            out.append(f"age {age[0]}-{age[1]}")
    for seg in ("gen z", "millennials", "women", "men", "moms", "parents", "students", "working professionals",
                "college students"):
        if re.search(rf"\b{seg}\b", t) and not any(seg in o for o in out):
            out.append(seg)
    return list(dict.fromkeys(o[:80] for o in out))[:10]


def _locations(text: str) -> list[str]:
    out: list[str] = []
    for loc in KNOWN_LOCATIONS:
        if re.search(rf"\b{re.escape(loc)}\b", text, flags=re.IGNORECASE):
            out.append(loc)
    for m in re.finditer(r"\b(?:based in|located in|from)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)", text):
        if m.group(1) not in out:
            out.append(m.group(1))
    # "Bengaluru" and "Bangalore" etc. both listed is fine; collapse India when a city is present
    if len(out) > 1 and "India" in out:
        out.remove("India")
    return out[:20]


def _requirements(text: str) -> list[str]:
    out: list[str] = []
    for line in text.splitlines():
        s = line.strip()
        if re.match(r"^([-*•]|\d+[.)])\s+", s):
            out.append(re.sub(r"^([-*•]|\d+[.)])\s+", "", s))
    for sentence in re.split(r"(?<=[.!?])\s+|\n", text):
        s = sentence.strip()
        if re.search(r"\b(must|should|required|requirement|need to|mandatory|no\s+\w+\s+allowed|avoid)\b", s, re.I):
            if s not in out and not any(s in o or o in s for o in out):
                out.append(s)
    return [" ".join(r.split())[:200] for r in out if r][:20]


def _title(text: str, niches: list[str]) -> tuple[str, str]:
    first = re.split(r"[.!?\n]", text.strip(), maxsplit=1)[0].strip()
    first = re.sub(r"^(title|campaign)\s*:\s*", "", first, flags=re.I)
    if 3 <= len(first) <= 80:
        return first, "medium"
    if niches:
        return f"{niches[0].title()} creator campaign", "low"
    return "Creator campaign", "low"


def parse_with_rules(text: str, today: date | None = None) -> dict[str, Any]:
    today = today or date.today()
    t = text.lower()
    niches, niche_conf = _niches(t)
    platforms, platform_conf = _platforms(t)
    deliverables = _deliverables(t)
    creators_needed = _creators_needed(t)
    budget, budget_conf = _budget(t, creators_needed)
    min_followers = _min_followers(t)
    deadline, deadline_conf = _deadline(t, today)
    timeline, timeline_conf = _timeline(t)
    audience = _audience(text, t)
    location = _locations(text)
    requirements = _requirements(text)
    title, title_conf = _title(text, niches)

    return {
        "title": title,
        "niche": niches,
        "platforms": platforms,
        "deliverables": deliverables,
        "audience": audience,
        "budget": budget,
        "creators_needed": creators_needed,
        "deadline": deadline.isoformat() if deadline else None,
        "timeline": timeline,
        "requirements": requirements,
        "location": location,
        "min_followers": min_followers,
        "confidence": {
            "title": title_conf,
            "niche": niche_conf,
            "platforms": platform_conf,
            "deliverables": "high" if deliverables else "low",
            "audience": "medium" if audience else "low",
            "budget": budget_conf,
            "creators_needed": "high" if creators_needed else "low",
            "deadline": deadline_conf,
            "timeline": timeline_conf,
            "requirements": "medium" if requirements else "low",
            "location": "medium" if location else "low",
            "min_followers": "high" if min_followers is not None else "low",
        },
    }
