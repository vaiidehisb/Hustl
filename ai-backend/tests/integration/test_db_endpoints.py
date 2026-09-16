"""End-to-end against TEST_DATABASE_URL with seeded public rows. Skipped when the DB is unreachable.

The service itself never writes public tables; only this fixture seeds (and removes) test rows.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta

import asyncpg
import pytest
from fastapi.testclient import TestClient

from tests.conftest import TEST_DATABASE_URL


def _db_ready() -> bool:
    async def check():
        conn = await asyncpg.connect(TEST_DATABASE_URL, timeout=3)
        try:
            return bool(await conn.fetchval("SELECT to_regclass('public.creator_profiles') IS NOT NULL"))
        finally:
            await conn.close()
    try:
        return asyncio.run(check())
    except Exception:  # noqa: BLE001
        return False


pytestmark = pytest.mark.skipif(not _db_ready(), reason="test database with public tables not reachable")

NOW = datetime.utcnow()
U = lambda: uuid.uuid4()  # noqa: E731


class Seed:
    def __init__(self) -> None:
        tag = uuid.uuid4().hex[:8]
        self.tag = tag
        self.brand_user, self.brand = U(), U()
        self.c1_user, self.c1 = U(), U()  # strong beauty creator
        self.c2_user, self.c2 = U(), U()  # finance creator, suspicious growth
        self.c3_user, self.c3 = U(), U()  # small creator
        self.acc1, self.acc2, self.acc3 = U(), U(), U()
        self.brief, self.deal, self.bad_deal, self.app1 = U(), U(), U(), U()
        self.users = [self.brand_user, self.c1_user, self.c2_user, self.c3_user]
        self.creators = [self.c1, self.c2, self.c3]


async def _seed(s: Seed) -> None:
    conn = await asyncpg.connect(TEST_DATABASE_URL)
    try:
        async with conn.transaction():
            for uid, name, age in [(s.brand_user, "Brand", 3), (s.c1_user, "Asha", 400), (s.c2_user, "Ravi", 30),
                                   (s.c3_user, "Neel", 60)]:
                await conn.execute(
                    """INSERT INTO users (id, email, name, role, kyc_status, created_at, updated_at)
                       VALUES ($1, $2, $3, $4::"UserRole", $5::"KycStatus", $6, $6)""",
                    uid, f"{name.lower()}-{s.tag}@test.local", name,
                    "BRAND" if uid == s.brand_user else "CREATOR",
                    "VERIFIED" if uid == s.c1_user else "NONE", NOW - timedelta(days=age))
            await conn.execute(
                """INSERT INTO brand_profiles (id, user_id, slug, company_name, updated_at)
                   VALUES ($1, $2, $3, 'Glow Co', now())""", s.brand, s.brand_user, f"glow-{s.tag}")
            for cid, uid, handle, niches, followers, er, loc in [
                (s.c1, s.c1_user, "asha", ["beauty", "skincare"], 85_000, 0.055, "Mumbai"),
                (s.c2, s.c2_user, "ravi", ["finance"], 40_000, 0.02, "Delhi"),
                (s.c3, s.c3_user, "neel", ["beauty"], 4_000, 0.08, "Pune"),
            ]:
                await conn.execute(
                    """INSERT INTO creator_profiles (id, user_id, handle, headline, bio, niches, followers_total,
                           engagement_rate, location, available, updated_at)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, now())""",
                    cid, uid, f"{handle}-{s.tag}", f"{niches[0]} creator", f"I make {' and '.join(niches)} content",
                    niches, followers, er, loc)
            for acc, cid, followers, likes, comments, er in [
                (s.acc1, s.c1, 85_000, 4_000.0, 300.0, 0.055),
                (s.acc2, s.c2, 40_000, 700.0, 50.0, 0.02),
                (s.acc3, s.c3, 4_000, 300.0, 20.0, 0.08),
            ]:
                await conn.execute(
                    """INSERT INTO social_accounts (id, creator_id, platform, source, status, handle, followers,
                           avg_likes, avg_comments, engagement_rate, updated_at)
                       VALUES ($1, $2, 'INSTAGRAM', 'PHYLLO', 'CONNECTED', 'h', $3, $4, $5, $6, now())""",
                    acc, cid, followers, likes, comments, er)
            # c2: 20k -> 40k inside 5 days
            for days_ago, followers in [(6, 20_000), (1, 40_000)]:
                await conn.execute(
                    """INSERT INTO social_metric_snapshots (id, social_account_id, followers, captured_at)
                       VALUES ($1, $2, $3, $4)""", U(), s.acc2, followers, NOW - timedelta(days=days_ago))
            await conn.execute(
                """INSERT INTO briefs (id, brand_id, title, description, requirements, niche, platforms,
                       min_followers, budget_per_creator, status, updated_at)
                   VALUES ($1, $2, 'Skincare serum launch', 'Beauty creators to review our vitamin C serum',
                           'Show morning skincare routine', 'beauty', ARRAY['INSTAGRAM']::"SocialPlatform"[],
                           10000, 30000, 'PUBLISHED', now())""", s.brief, s.brand)
            # completed deal for c1 with an on-time milestone and a 5-star review
            await conn.execute(
                """INSERT INTO deals (id, title, brief_id, brand_id, creator_id, status, amount, payment_mode,
                       brand_fee_rate, creator_fee_rate, processing_fee_rate, updated_at)
                   VALUES ($1, 'Serum deal', $2, $3, $4, 'COMPLETED', 30000, 'COMPLETION', 0.08, 0.05, 0.02, now())""",
                s.deal, s.brief, s.brand, s.c1)
            await conn.execute(
                """INSERT INTO milestones (id, deal_id, position, title, percent, amount, due_date, submitted_at,
                       status, revision_count, updated_at)
                   VALUES ($1, $2, 0, 'Reel', 100, 30000, $3, $4, 'RELEASED', 1, now())""",
                U(), s.deal, NOW - timedelta(days=5), NOW - timedelta(days=6))
            await conn.execute(
                """INSERT INTO reviews (id, deal_id, author_id, subject_user_id, rating) VALUES ($1, $2, $3, $4, 5)""",
                U(), s.deal, s.brand_user, s.c1_user)
            # high-value deal from a 3-day-old brand with repeated failed payments
            await conn.execute(
                """INSERT INTO deals (id, title, brand_id, creator_id, status, amount, payment_mode,
                       brand_fee_rate, creator_fee_rate, processing_fee_rate, updated_at)
                   VALUES ($1, 'Big deal', $2, $3, 'CONTRACT_SIGNED', 250000, 'COMPLETION', 0.08, 0.05, 0.02, now())""",
                s.bad_deal, s.brand, s.c2)
            for i in range(3):
                await conn.execute(
                    """INSERT INTO payment_intents (id, deal_id, provider, status, escrow_amount, brand_fee,
                           processing_fee, total_amount, idempotency_key, updated_at)
                       VALUES ($1, $2, 'TEST', 'FAILED', 250000, 20000, 5000, 275000, $3, now())""",
                    U(), s.bad_deal, f"{s.tag}-{i}")
            await conn.execute(
                """INSERT INTO applications (id, brief_id, creator_id, pitch, proposed_rate, updated_at)
                   VALUES ($1, $2, $3, 'I review serums and skincare routines weekly', 28000, now())""",
                s.app1, s.brief, s.c1)
    finally:
        await conn.close()


async def _cleanup(s: Seed) -> None:
    conn = await asyncpg.connect(TEST_DATABASE_URL)
    try:
        async with conn.transaction():
            await conn.execute("DELETE FROM payment_intents WHERE deal_id = ANY($1::uuid[])", [s.deal, s.bad_deal])
            await conn.execute("DELETE FROM deals WHERE id = ANY($1::uuid[])", [s.deal, s.bad_deal])
            await conn.execute("DELETE FROM users WHERE id = ANY($1::uuid[])", s.users)  # cascades profiles/briefs
            if await conn.fetchval("SELECT to_regclass('ai.creator_embeddings') IS NOT NULL"):
                await conn.execute("DELETE FROM ai.creator_embeddings WHERE id = ANY($1::uuid[])", s.creators)
                await conn.execute("DELETE FROM ai.brief_embeddings WHERE id = $1", s.brief)
    finally:
        await conn.close()


@pytest.fixture(scope="module")
def seed():
    s = Seed()
    asyncio.run(_seed(s))
    yield s
    asyncio.run(_cleanup(s))


@pytest.fixture(scope="module")
def client(seed):
    from app.main import app

    with TestClient(app) as c:
        yield c


H = {"x-internal-token": "test-token"}


def test_migrations_are_idempotent():
    from app.db.migrate import run_migrations

    async def go():
        conn = await asyncpg.connect(TEST_DATABASE_URL)
        try:
            first = await run_migrations(conn)
            second = await run_migrations(conn)
            tables = await conn.fetch("SELECT table_name FROM information_schema.tables WHERE table_schema = 'ai'")
            return first, second, {t["table_name"] for t in tables}
        finally:
            await conn.close()

    first, second, tables = asyncio.run(go())
    assert first == second and first in {"pgvector", "array"}
    assert {"creator_embeddings", "brief_embeddings", "brief_parse_cache", "schema_migrations"} <= tables


def test_embeddings_upsert_and_skip_unchanged(client, seed):
    r = client.post(f"/ai/embeddings/creators/{seed.c1}", headers=H)
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["embedding_model"] == "hashing-v1-384" and d["dims"] == 384 and d["vector_backend"] in {"pgvector", "array"}
    again = client.post(f"/ai/embeddings/creators/{seed.c1}", headers=H).json()["data"]
    assert again["updated"] is False and again["content_hash"] == d["content_hash"]
    assert client.post(f"/ai/embeddings/briefs/{seed.brief}", headers=H).status_code == 200


def test_unknown_ids_return_not_found(client):
    for path in (f"/ai/embeddings/creators/{uuid.uuid4()}", f"/ai/scores/refresh/{uuid.uuid4()}",
                 f"/ai/fraud/analyze-creator/{uuid.uuid4()}", f"/ai/fraud/analyze-deal/{uuid.uuid4()}"):
        r = client.post(path, headers=H)
        assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND", path
    r = client.post("/ai/match", json={"brief_id": str(uuid.uuid4())}, headers=H)
    assert r.status_code == 404


def test_match_ranks_seeded_creators(client, seed):
    r = client.post("/ai/embeddings/refresh-batch", json={"kind": "creator", "ids": [str(c) for c in seed.creators]},
                    headers=H)
    assert r.status_code == 200 and r.json()["data"]["mode"] == "inline" and r.json()["data"]["failed"] == 0

    r = client.post("/ai/match", json={"brief_id": str(seed.brief), "limit": 50}, headers=H)
    assert r.status_code == 200, r.text
    body = r.json()
    ours = [m for m in body["data"] if m["creator_id"] in {str(c) for c in seed.creators}]
    assert len(ours) == 3
    order = [m["creator_id"] for m in ours]
    assert order.index(str(seed.c1)) < order.index(str(seed.c2))
    small = next(m for m in ours if m["creator_id"] == str(seed.c3))
    assert any("minimum followers" in d for d in small["disqualifiers"])
    for m in ours:
        assert 0 <= m["match_score"] <= 100 and len(m["match_reasons"]) <= 3
        assert set(m["components"]) == {"semantic", "engagement_fit", "follower_fit", "reliability", "availability"}
    assert body["meta"]["embedding_model"] == "hashing-v1-384" and body["meta"]["candidates_considered"] >= 3


def test_score_refresh_uses_real_delivery_history(client, seed):
    r = client.post(f"/ai/scores/refresh/{seed.c1}", headers=H)
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["model_version"] == "v1-formula"
    trust = d["signals"]["trust"]["components"]
    assert trust["avg_brand_rating"]["value"] == 5.0 and trust["completed_deals"]["value"] == 1
    rel = d["signals"]["reliability"]["components"]
    assert rel["on_time_delivery"]["value"] == 1.0 and rel["revision_rate"]["value"] == 1.0
    assert rel["response_time_hours"]["status"] == "insufficient_data"

    new = client.post(f"/ai/scores/refresh/{seed.c3}", headers=H).json()["data"]
    assert new["signals"]["trust"]["components"]["avg_brand_rating"]["status"] == "insufficient_data"
    assert d["trust_score"] > new["trust_score"]


def test_fraud_creator_and_deal(client, seed):
    d = client.post(f"/ai/fraud/analyze-creator/{seed.c2}", headers=H).json()["data"]
    codes = {f["code"] for f in d["flags"]}
    assert {"SUSPICIOUS_GROWTH", "FOLLOWER_SPIKE"} <= codes
    assert d["checks"]["isolation_forest"]["model"] in {"insufficient_population", "isolation_forest"}
    assert d["authenticity_score"] < 100 and isinstance(d["needs_review"], bool)

    clean = client.post(f"/ai/fraud/analyze-creator/{seed.c1}", headers=H).json()["data"]
    assert clean["flags"] == [] or all(f["source"] == "ISOLATION_FOREST" for f in clean["flags"])

    deal = client.post(f"/ai/fraud/analyze-deal/{seed.bad_deal}", headers=H).json()["data"]
    assert {f["code"] for f in deal["flags"]} == {"NEW_ACCOUNT_HIGH_VALUE", "REPEATED_PAYMENT_FAILURES"}
    assert deal["risk_level"] in {"MEDIUM", "HIGH"}


def test_application_scoring_single_and_batch(client, seed):
    r = client.post("/ai/applications/score", json={"application_id": str(seed.app1)}, headers=H)
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["disqualifiers"] == [] and 0 <= d["match_score"] <= 100 and d["model_version"] == "v1-formula"

    preview = client.post("/ai/applications/score", json={"creator_id": str(seed.c3), "brief_id": str(seed.brief)},
                          headers=H).json()["data"]
    assert preview["application_id"] is None and preview["disqualifiers"]

    batch = client.post("/ai/applications/score-batch", json={"brief_id": str(seed.brief)}, headers=H).json()["data"]
    assert batch["mode"] == "inline" and batch["total"] == 1 and batch["failed"] == 0


def test_parse_brief_is_cached(client):
    text = f"Need 2 travel creators for 3 reels, budget 40k per creator {uuid.uuid4()}"
    first = client.post("/ai/parse-brief", json={"text": text}, headers=H).json()["data"]
    second = client.post("/ai/parse-brief", json={"text": text}, headers=H).json()["data"]
    assert first["cached"] is False and second["cached"] is True
    assert second["budget"] == first["budget"] and second["source"] == "rules"
