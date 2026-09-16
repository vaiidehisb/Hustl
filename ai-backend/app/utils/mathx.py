from __future__ import annotations

import math
from collections.abc import Sequence

import numpy as np


def clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def minmax(v: float, lo: float, hi: float) -> float:
    """Min-max normalise v into [0, 1] against fixed bounds (clamped)."""
    if hi == lo:
        return 0.0
    return clamp((v - lo) / (hi - lo))


def cosine(a: Sequence[float] | np.ndarray | None, b: Sequence[float] | np.ndarray | None) -> float:
    if a is None or b is None:
        return 0.0
    va = np.asarray(a, dtype=np.float64)
    vb = np.asarray(b, dtype=np.float64)
    if va.shape != vb.shape or va.size == 0:
        return 0.0
    na, nb = np.linalg.norm(va), np.linalg.norm(vb)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(va, vb) / (na * nb))


def safe_log10(v: float) -> float:
    return math.log10(v) if v > 0 else 0.0
