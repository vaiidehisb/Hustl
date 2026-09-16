"""Test environment. Env vars override .env (pydantic-settings precedence)."""

import os

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "postgresql://hustl@localhost:5433/hustl_test")

os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["INTERNAL_SERVICE_TOKEN"] = "test-token"
os.environ["EMBEDDING_BACKEND"] = "hashing"
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["REDIS_URL"] = ""
os.environ["FRAUD_MIN_POPULATION"] = "50"

import pytest  # noqa: E402

from app.config import get_settings  # noqa: E402

get_settings.cache_clear()

TOKEN = {"x-internal-token": "test-token"}


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return dict(TOKEN)
