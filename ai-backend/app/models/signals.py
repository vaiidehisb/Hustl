"""Explainable weighted-signal primitives.

Every score is a weighted sum of normalised signals. A signal with no underlying
data is marked `insufficient_data` and contributes a neutral prior instead of an
invented value, so the output always says what it was (and wasn't) based on.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

NEUTRAL_PRIOR = 0.5
OK = "ok"
INSUFFICIENT = "insufficient_data"


@dataclass
class Signal:
    name: str
    weight: float
    normalized: float  # 0..1 used in the score (the prior when insufficient)
    status: str = OK
    value: Any = None  # raw observed value (None when insufficient)
    detail: str | None = None

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["normalized"] = round(self.normalized, 4)
        if isinstance(self.value, float):
            d["value"] = round(self.value, 4)
        return {k: v for k, v in d.items() if v is not None}


def observed(name: str, weight: float, value: Any, normalized: float, detail: str | None = None) -> Signal:
    return Signal(name=name, weight=weight, normalized=max(0.0, min(1.0, normalized)), value=value, detail=detail)


def insufficient(name: str, weight: float, detail: str, prior: float = NEUTRAL_PRIOR) -> Signal:
    return Signal(name=name, weight=weight, normalized=prior, status=INSUFFICIENT, detail=detail)


def weighted_score(signals: list[Signal]) -> int:
    total_w = sum(s.weight for s in signals)
    if total_w <= 0:
        return round(NEUTRAL_PRIOR * 100)
    return int(round(100 * sum(s.weight * s.normalized for s in signals) / total_w))


def summarize(signals: list[Signal]) -> dict[str, Any]:
    return {
        "components": {s.name: s.to_dict() for s in signals},
        "data_coverage": round(
            sum(s.weight for s in signals if s.status == OK) / (sum(s.weight for s in signals) or 1), 4
        ),
    }
