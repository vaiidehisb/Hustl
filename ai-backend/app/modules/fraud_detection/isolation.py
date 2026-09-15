"""Isolation Forest over (followers, avg_likes, avg_comments, growth), fitted on the
current creator population. Only used when the population is large enough."""

from __future__ import annotations

import time
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

import numpy as np
from sklearn.ensemble import IsolationForest

from app.modules.fraud_detection.rules import FraudFlag

FEATURES = ("followers", "avg_likes", "avg_comments", "growth")


def feature_matrix(rows: Sequence[Mapping[str, Any]]) -> np.ndarray:
    return np.array(
        [[np.log1p(max(float(r["followers"] or 0), 0)),
          np.log1p(max(float(r["avg_likes"] or 0), 0)),
          np.log1p(max(float(r["avg_comments"] or 0), 0)),
          float(np.clip(r.get("growth") or 0.0, -1.0, 5.0))] for r in rows],
        dtype=np.float64,
    )


@dataclass
class FittedForest:
    model: IsolationForest
    ids: list[str]
    scores: np.ndarray  # score_samples for the training population (lower = more anomalous)
    predictions: np.ndarray
    fitted_at: float


class PopulationDetector:
    def __init__(self, min_population: int = 50, ttl_seconds: float = 600, contamination: float = 0.05) -> None:
        self.min_population = min_population
        self.ttl_seconds = ttl_seconds
        self.contamination = contamination
        self._fitted: FittedForest | None = None
        self._population_token: tuple | None = None

    def fit(self, rows: Sequence[Mapping[str, Any]]) -> FittedForest | None:
        if len(rows) < self.min_population:
            return None
        token = (
            len(rows),
            hash(tuple(sorted(str(r["creator_id"]) for r in rows))),
            round(float(feature_matrix(rows).sum()), 6),
        )
        if (self._fitted and self._population_token == token
                and time.monotonic() - self._fitted.fitted_at < self.ttl_seconds):
            return self._fitted
        X = feature_matrix(rows)
        model = IsolationForest(n_estimators=200, contamination=self.contamination, random_state=42)
        model.fit(X)
        self._fitted = FittedForest(model, [str(r["creator_id"]) for r in rows], model.score_samples(X),
                                    model.predict(X), time.monotonic())
        self._population_token = token
        return self._fitted

    def analyze(self, creator_id: str, rows: Sequence[Mapping[str, Any]]) -> tuple[dict[str, Any], list[FraudFlag]]:
        with_growth = sum(1 for r in rows if r.get("growth") is not None)
        if len(rows) < self.min_population:
            return {"model": "insufficient_population", "population": len(rows),
                    "min_population": self.min_population}, []
        fitted = self.fit(rows)
        assert fitted is not None
        info: dict[str, Any] = {"model": "isolation_forest", "population": len(rows),
                                "features": list(FEATURES), "growth_imputed_for": len(rows) - with_growth}
        if creator_id not in fitted.ids:
            info["status"] = "creator_has_no_metrics"
            return info, []
        idx = fitted.ids.index(creator_id)
        score = float(fitted.scores[idx])
        percentile = float((fitted.scores < score).mean())
        info.update({"anomaly_score": round(score, 4), "percentile": round(percentile, 4)})
        if fitted.predictions[idx] == -1:
            r = rows[idx]
            return info, [FraudFlag(
                "METRICS_OUTLIER", "Audience metrics are a statistical outlier versus the creator population",
                "MEDIUM" if percentile < 0.02 else "LOW", source="ISOLATION_FOREST",
                details={"anomaly_score": round(score, 4), "percentile": round(percentile, 4),
                         "followers": r["followers"], "avg_likes": r["avg_likes"],
                         "avg_comments": r["avg_comments"], "growth": r.get("growth")},
            )]
        return info, []
