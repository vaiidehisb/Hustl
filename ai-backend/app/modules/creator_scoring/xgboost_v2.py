"""Placeholder for creator scoring v2 (XGBoost, served from the MLflow model registry).

Not trained yet. This class shows the plug-in point: it loads a registered
pyfunc model and predicts the three scores from the same feature set v1 uses.
Enable with SCORING_MODEL=v2-xgboost once a model is registered.
"""

from __future__ import annotations

from typing import Any

from app.modules.creator_scoring.base import CreatorScoringInput, ScoreResult, ScoringModel
from app.modules.creator_scoring.formula_v1 import niche_signals, reliability_signals, trust_signals
from app.utils.errors import integration_unavailable

FEATURE_ORDER: list[str] = []  # filled from the registered model signature at load time


def feature_row(data: CreatorScoringInput) -> dict[str, Any]:
    """Flatten v1 signals into model features; insufficient signals become NaN (XGBoost handles missing)."""
    row: dict[str, Any] = {}
    for sig in (*trust_signals(data), *niche_signals(data), *reliability_signals(data)):
        row[sig.name] = sig.normalized if sig.status == "ok" else float("nan")
    return row


class XGBoostV2Model(ScoringModel):
    version = "v2-xgboost"

    def __init__(self, model_uri: str, tracking_uri: str | None) -> None:
        self.model_uri = model_uri
        self.tracking_uri = tracking_uri
        self._model = None

    def _load(self):
        if self._model is None:
            try:
                import mlflow  # optional dependency
            except ImportError as exc:
                raise integration_unavailable("MLflow", reason="mlflow is not installed") from exc
            if not self.tracking_uri:
                raise integration_unavailable("MLflow", ["MLFLOW_TRACKING_URI"])
            mlflow.set_tracking_uri(self.tracking_uri)
            self._model = mlflow.pyfunc.load_model(self.model_uri)
        return self._model

    def score(self, data: CreatorScoringInput) -> ScoreResult:
        import pandas as pd  # shipped with mlflow

        model = self._load()
        row = feature_row(data)
        pred = model.predict(pd.DataFrame([row]))
        trust, niche, reliability = (int(round(float(x))) for x in list(pred[0])[:3])
        return ScoreResult(trust, niche, reliability, self.version, {"features": row, "model_uri": self.model_uri})
