"""HTTP contract: auth, envelopes, validation. Works with or without a reachable DB."""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_health_is_public_and_reports_backends(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    data = body["data"]
    assert data["embedding"]["backend"] == "hashing" and data["embedding_model"] == "hashing-v1-384"
    assert data["brief_parser"]["engine"] == "rules"
    assert data["batch_mode"] == "inline"
    assert data["database"]["status"] in {"up", "down"}


@pytest.mark.parametrize("headers", [{}, {"x-internal-token": "wrong"}])
def test_ai_routes_require_internal_token(client, headers):
    r = client.post("/ai/match", json={"brief_id": str(uuid.uuid4())}, headers=headers)
    assert r.status_code == 403
    assert r.json() == {"success": False, "error": {"code": "FORBIDDEN", "message": r.json()["error"]["message"],
                                                     "details": None}}


def test_validation_error_envelope(client, auth_headers):
    r = client.post("/ai/match", json={"brief_id": "not-a-uuid", "limit": 0}, headers=auth_headers)
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["code"] == "VALIDATION_ERROR" and isinstance(err["details"], list)

    r = client.post("/ai/parse-brief", json={}, headers=auth_headers)
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"

    r = client.post("/ai/applications/score", json={"creator_id": str(uuid.uuid4())}, headers=auth_headers)
    assert r.status_code == 422


def test_parse_brief_rules_mode(client, auth_headers):
    r = client.post("/ai/parse-brief", json={"text": "3 tech creators on YouTube, 1 video each, budget 50k per creator"},
                    headers=auth_headers)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["source"] == "rules"
    assert data["platforms"] == ["YOUTUBE"] and data["budget"]["per_creator"] == 50_000
    assert set(data["confidence"]) >= {"budget", "platforms", "niche"}


def test_unknown_route_uses_envelope(client, auth_headers):
    r = client.get("/ai/nope", headers=auth_headers)
    assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"


def test_task_status_without_redis_is_integration_unavailable(client, auth_headers):
    r = client.get("/ai/tasks/abc", headers=auth_headers)
    assert r.status_code == 503 and r.json()["error"]["code"] == "INTEGRATION_UNAVAILABLE"
