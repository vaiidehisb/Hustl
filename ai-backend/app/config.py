"""Service configuration (pydantic-settings). Reads env vars, then `.env`."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def strip_schema_param(url: str) -> str:
    """Remove Prisma's `?schema=` query parameter, which asyncpg rejects."""
    if not url:
        return url
    parts = urlsplit(url)
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k.lower() != "schema"]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "hustl-ai-backend"
    environment: str = "development"
    log_level: str = "INFO"

    database_url: str = ""
    db_pool_min_size: int = 1
    db_pool_max_size: int = 10
    run_migrations_on_startup: bool = True

    internal_service_token: str = ""

    embedding_backend: Literal["sentence-transformers", "hashing"] = "hashing"
    sentence_transformer_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    embedding_dims: int = 384

    anthropic_api_key: str | None = None
    brief_parser_model: str = "claude-sonnet-4-6"
    brief_parser_timeout_seconds: float = 30.0

    redis_url: str | None = None

    scoring_model: Literal["v1-formula", "v2-xgboost"] = "v1-formula"
    mlflow_tracking_uri: str | None = None
    mlflow_scoring_model_uri: str = "models:/creator-scoring/Production"

    match_candidate_pool: int = 200
    fraud_min_population: int = 50
    fraud_high_value_deal_amount: int = 50_000  # INR
    fraud_failed_payment_threshold: int = 3

    @field_validator("anthropic_api_key", "redis_url", "mlflow_tracking_uri", mode="before")
    @classmethod
    def _blank_to_none(cls, v: object) -> object:
        return None if isinstance(v, str) and not v.strip() else v

    @property
    def dsn(self) -> str:
        return strip_schema_param(self.database_url)


@lru_cache
def get_settings() -> Settings:
    return Settings()
