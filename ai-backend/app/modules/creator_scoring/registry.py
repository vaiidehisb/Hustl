from __future__ import annotations

from functools import lru_cache

from app.config import get_settings
from app.modules.creator_scoring.base import ScoringModel
from app.modules.creator_scoring.formula_v1 import FormulaV1Model


@lru_cache
def get_scoring_model() -> ScoringModel:
    settings = get_settings()
    if settings.scoring_model == "v2-xgboost":
        from app.modules.creator_scoring.xgboost_v2 import XGBoostV2Model

        return XGBoostV2Model(settings.mlflow_scoring_model_uri, settings.mlflow_tracking_uri)
    return FormulaV1Model()
