"""Feature functions shared by matching (module 1) and application scoring (module 5)."""

from __future__ import annotations

from app.models.features import BriefCriteria, CandidateCreator
from app.models.signals import Signal, insufficient, observed
from app.utils.benchmarks import benchmark_er
from app.utils.mathx import clamp, minmax, safe_log10
from app.utils.niches import niche_overlap

# Cosine similarities from MiniLM / hashing rarely exceed ~0.7 for relevant pairs.
SIM_FLOOR, SIM_CEIL = 0.05, 0.65


def semantic(c: CandidateCreator, b: BriefCriteria, weight: float) -> tuple[Signal, float | None]:
    niche = niche_overlap(c.niches, [b.niche]) if b.niche else None
    if c.similarity is None and niche is None:
        return insufficient("semantic", weight, "no embedding and no brief niche"), None
    sim = minmax(c.similarity, SIM_FLOOR, SIM_CEIL) if c.similarity is not None else 0.0
    value = max(sim, (niche or 0.0) * 0.85)
    return observed("semantic", weight, {"cosine": round(c.similarity, 4) if c.similarity is not None else None,
                                         "niche_overlap": niche}, value), niche


def engagement_fit(c: CandidateCreator, b: BriefCriteria, weight: float) -> Signal:
    if c.engagement_rate is None or not c.followers:
        return insufficient("engagement_fit", weight, "no engagement data")
    target = max(b.min_engagement, benchmark_er(c.followers, c.niches))
    ratio = c.engagement_rate / target if target > 0 else 0.0
    return observed("engagement_fit", weight, round(c.engagement_rate, 4), clamp(ratio / 1.5),
                    detail=f"target {target:.4f}")


def follower_fit(c: CandidateCreator, b: BriefCriteria, weight: float) -> Signal:
    if not c.followers:
        return insufficient("follower_fit", weight, "no follower data")
    if b.min_followers > 0:
        return observed("follower_fit", weight, c.followers, clamp(c.followers / b.min_followers),
                        detail=f"minimum {b.min_followers}")
    # No minimum set: favour established audiences on a log scale (1K → 0.5, 1M → 1.0).
    return observed("follower_fit", weight, c.followers, 0.5 + 0.5 * minmax(safe_log10(c.followers), 3, 6))


def reliability(c: CandidateCreator, weight: float) -> Signal:
    if c.reliability_score is None:
        return insufficient("reliability", weight, "creator has not been scored yet")
    return observed("reliability", weight, c.reliability_score, c.reliability_score / 100)


def platform_coverage(c: CandidateCreator, b: BriefCriteria) -> float | None:
    if not b.platforms:
        return None
    have = set(c.platforms)
    return sum(1 for p in b.platforms if p in have) / len(b.platforms)


def location_match(c: CandidateCreator, b: BriefCriteria) -> float | None:
    if not b.locations:
        return None
    loc = c.location.lower()
    if not loc:
        return None
    wanted = [l.split(",")[0].strip().lower() for l in b.locations]
    if any(w in {"india", "pan india", "pan-india", "anywhere", "remote"} for w in wanted):
        return 1.0
    return 1.0 if any(w and w in loc for w in wanted) else 0.0


def hard_disqualifiers(c: CandidateCreator, b: BriefCriteria, check_availability: bool = True) -> list[str]:
    out: list[str] = []
    if b.min_followers > 0 and (c.followers or 0) < b.min_followers:
        out.append(f"Below minimum followers ({c.followers or 0:,} < {b.min_followers:,})")
    if b.min_engagement > 0:
        if c.engagement_rate is None:
            out.append("No engagement data to verify minimum engagement")
        elif c.engagement_rate < b.min_engagement:
            out.append(f"Below minimum engagement ({c.engagement_rate:.2%} < {b.min_engagement:.2%})")
    if b.platforms and not set(b.platforms) & set(c.platforms):
        out.append(f"Not active on required platform ({', '.join(b.platforms)})")
    if c.authenticity_score is not None and c.authenticity_score < 60:
        out.append("Audience authenticity under review")
    if check_availability and not c.available:
        out.append("Currently unavailable")
    return out


def reasons(c: CandidateCreator, b: BriefCriteria, niche: float | None, similarity_norm: float | None) -> list[str]:
    """Candidate reasons with strengths; callers keep the top 3."""
    scored: list[tuple[float, str]] = []
    if niche == 1.0 and b.niche:
        scored.append((0.95, f"Core {b.niche} creator"))
    if similarity_norm is not None and similarity_norm >= 0.6:
        scored.append((0.6 + similarity_norm * 0.3, "Content strongly aligned with the brief"))
    if c.engagement_rate is not None and c.followers:
        bench = benchmark_er(c.followers, c.niches)
        if c.engagement_rate >= bench * 1.2:
            scored.append((min(0.9, 0.5 + c.engagement_rate / bench / 10),
                           f"Engagement {c.engagement_rate:.1%}, above tier benchmark"))
    if c.reliability_score is not None and c.reliability_score >= 80:
        scored.append((0.5 + c.reliability_score / 250, f"Reliability {c.reliability_score}/100"))
    if b.min_followers and c.followers and c.followers >= b.min_followers:
        scored.append((0.4, f"{c.followers:,} followers meets the minimum"))
    cov = platform_coverage(c, b)
    if cov == 1.0:
        scored.append((0.45, f"Active on {', '.join(p.title() for p in b.platforms)}"))
    if location_match(c, b) == 1.0 and c.location:
        scored.append((0.35, f"Based in {c.location}"))
    scored.sort(key=lambda x: -x[0])
    return [text for _, text in scored]
