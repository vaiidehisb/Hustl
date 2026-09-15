# hustl. AI backend

Internal FastAPI service for creator matching, creator scoring, brief parsing, fraud detection and application scoring. Only backend Node services call it, never browsers. Every `/ai/*` route requires the `x-internal-token` header to equal `INTERNAL_SERVICE_TOKEN` (otherwise 403).

It **reads** the shared `public` tables and **writes only** its own `ai` schema (embeddings, parse cache). The Node services persist the scores and flags it returns.

## Run locally

```bash
pip install -r requirements-dev.txt        # no torch; use EMBEDDING_BACKEND=hashing
cp .env.example .env                        # set DATABASE_URL + INTERNAL_SERVICE_TOKEN
python -m app.db.migrate                    # optional: migrations also run on startup
python -m uvicorn app.main:app --port 8000
python -m pytest -q                         # DB tests use TEST_DATABASE_URL and skip if it is unreachable
```

Docker: `docker build -t hustl-ai .` (Python 3.11, full requirements, MiniLM model baked in, `EMBEDDING_BACKEND=sentence-transformers`).

Celery worker (only when `REDIS_URL` is set): `celery -A app.workers.celery_app worker --loglevel=INFO`.

## Layout

```
app/
  main.py              app factory, error envelope, lifespan (pool + migrations)
  config.py            pydantic-settings
  api/                 deps (token auth, DB), routes/health.py, routes/ai.py
  schemas/             request models
  models/              signal + feature dataclasses used by the pure modules
  modules/
    matching/          features.py, rerank.py (pure), service.py
    creator_scoring/   base.py (ScoringModel), formula_v1.py, xgboost_v2.py (plug-in stub), registry.py, service.py
    brief_parser/      schema.py, rules.py, validation.py, claude.py, service.py
    fraud_detection/   rules.py, isolation.py, service.py
    application_scoring/ scorer.py (pure), service.py
  repositories/        read-only SQL on public tables, plus ai.* vector and cache storage
  services/            embedding backends, text builders, embedding store, batch jobs
  workers/             celery_app.py, tasks.py
  db/                  pool, bootstrap, migrate.py, migrations/*.sql
tests/unit, tests/integration
```

## Envelope

Success: `{ "success": true, "data": ..., "meta"?: ... }`. Failure: `{ "success": false, "error": { "code", "message", "details" } }`.

Codes: `FORBIDDEN` 403, `NOT_FOUND` 404, `VALIDATION_ERROR` 422, `INTEGRATION_UNAVAILABLE` 503 (DB down, Celery or MLflow not configured), `INTERNAL_ERROR` 500.

## Endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/health` (no auth) | | db status, `embedding`/`embedding_model`, `vector_backend`, parser engine, batch mode |
| POST | `/ai/match` | `{brief_id, limit=20}` | `data: [{creator_id, match_score, match_reasons, disqualifiers, components}]`, `meta` (model, backend, candidates, latency) |
| POST | `/ai/scores/refresh/{creator_id}` | | `{trust_score, niche_authority, reliability_score, model_version, signals}` |
| POST | `/ai/scores/recompute-batch` | `{creator_ids?}` | Celery `{mode:"celery", task_id}` or inline `{mode:"inline", results}` |
| POST | `/ai/parse-brief` | `{text}` or `{fields:{title,description,requirements,budget,deadline,platforms,niche,deliverables}}` | parsed brief + `confidence`, `source`, `model`, `cached`, `warnings` |
| POST | `/ai/fraud/analyze-creator/{creator_id}` | | `{authenticity_score, risk_level, needs_review, flags, checks}` |
| POST | `/ai/fraud/analyze-deal/{deal_id}` | | same shape |
| POST | `/ai/applications/score` | `{application_id}` or `{creator_id, brief_id}` | `{match_score, match_reasons, disqualifiers, components, model_version}` |
| POST | `/ai/applications/score-batch` | `{application_ids?, brief_id?}` | Celery task or inline results |
| POST | `/ai/embeddings/creators/{id}?force=` | | `{id, embedding_model, dims, content_hash, updated, vector_backend}` |
| POST | `/ai/embeddings/briefs/{id}?force=` | | same |
| POST | `/ai/embeddings/refresh-batch` | `{kind:"creator"\|"brief", ids?, force?}` | Celery task or inline results |
| GET | `/ai/tasks/{task_id}` | | Celery task state/result (503 without `REDIS_URL`) |

## How the modules work

**Embeddings.** The text is built from real rows. For creators: headline, bio, niches, connected platforms, languages, location, portfolio and rate card. For briefs: title, description, requirements, niche, platforms, audience and deliverables. Vectors are stored with `model` and `content_hash`; unchanged content is not re-embedded.
- `EMBEDDING_BACKEND=sentence-transformers`: all-MiniLM-L6-v2, 384-dim, lazy-loaded.
- `hashing`: deterministic 384-dim FNV feature hashing with niche synonym expansion, bit-compatible with `frontend/lib/ai/embed.ts`.

At startup, if `pg_available_extensions` lists `vector`, the service uses `vector(384)` with an HNSW cosine index and `<=>` ANN queries. Otherwise it uses `double precision[]` with exact cosine in numpy over a cached matrix. ANN only compares vectors from the active model.

**Matching.** The service embeds the brief, pulls the ANN top `MATCH_CANDIDATE_POOL` (200), and keeps active, non-deleted creators. It re-ranks with these weights:
- semantic 40%: cosine, rescaled, floored by niche overlap
- engagement fit 20%: ER vs max(brief minimum, tier×niche benchmark)
- follower fit 15%
- reliability 15%: persisted `creator_scores.reliability_score`
- availability 10%

Hard misses become `disqualifiers` (followers, ER, platform, authenticity < 60, unavailable). Each one subtracts 10 points, and disqualified creators rank last. Missing data gets a neutral 0.5 marked `insufficient_data`.

**Creator scoring v1** (`model_version: "v1-formula"`). Weighted signals, min-max normalised against fixed bounds, computed from deals, milestones, reviews, disputes, deal_offers, deal_events and social accounts:
- Trust: completed deals 30%, brand rating 30%, dispute rate 15% (lost disputes count double), account age 10%, KYC 15%.
- Niche authority: ER vs tier and niche benchmark 50%, audience-interest and niche overlap 25% (Phyllo demographics only), completed collab niche alignment 25%.
- Reliability: on-time milestones 40% (overdue unsubmitted count as late), revisions per submission 20%, offer response time 20%, creator cancellations 20%.

Signals without data are `insufficient_data` with a 0.5 prior; `data_coverage` shows how much was observed. `ScoringModel` (`base.py`) is the plug-in interface. `SCORING_MODEL=v2-xgboost` loads a registered MLflow model (`xgboost_v2.py`, untrained).

**Brief parser.** With `ANTHROPIC_API_KEY` set, it calls `client.messages.create` using:
- model `BRIEF_PARSER_MODEL`, default `claude-sonnet-4-6`
- temperature 0
- `output_config.format` json_schema

It then requires `stop_reason == "end_turn"`, `json.loads`, alias normalisation, strict Pydantic validation (budget ≥ 0, platform/niche enums, ISO dates, bounds) and soft checks (past deadline, inconsistent totals lower confidence).

Any failure falls back to the deterministic rule parser, which reports `fallback_reason`. Explicit `fields` override parsed values with `high` confidence.

Results are cached in `ai.brief_parse_cache` by sha256 of (parser version, engine, model, whitespace-normalised input). Only results from the configured engine are cached.

Note: `temperature` is rejected by newer models such as Opus 5. If you point `BRIEF_PARSER_MODEL` at one, calls fail and the service falls back to rules.

**Fraud.** Rules:
- `LOW_ENGAGEMENT`: ER < 0.5% on 100K+ followers.
- `SUSPICIOUS_GROWTH`: > 30% inside any 7-day snapshot window.
- `FOLLOWER_SPIKE`: > 20% between consecutive syncs.
- `BOT_AUDIENCE`: Phyllo follower types / credibility.
- `ER_ANOMALY`: > 4× tier benchmark.
- Deals: `NEW_ACCOUNT_HIGH_VALUE` (brand < 7 days, amount ≥ `FRAUD_HIGH_VALUE_DEAL_AMOUNT`), `REPEATED_PAYMENT_FAILURES` (FAILED payment_intents ≥ threshold), `SELF_DEALING`.

An Isolation Forest over log(followers, avg_likes, avg_comments) plus growth is fitted on the creator population. It runs only when ≥ `FRAUD_MIN_POPULATION` (50) creators have metrics; otherwise `checks.isolation_forest.model = "insufficient_population"`.

Authenticity = 100 − (HIGH 30, MEDIUM 15, LOW 5 per flag). Risk is LOW ≥ 80, MEDIUM ≥ 60, otherwise HIGH; `needs_review` when < 60. A creator with no connected accounts gets `authenticity_score: null`, `risk_level: "insufficient_data"`. Flags are advisory; nothing is auto-banned.

**Application scoring.** Hard requirements (min followers, min ER, platform) become disqualifiers, −10 each. Then the score is:
- semantic 35%: creator↔brief cosine, blended 70/30 with pitch↔brief
- structured 40%: mean of follower fit, ER fit, platform coverage, niche overlap, proposed rate vs budget, location
- reliability 25%

## Environment

| Var | Default | Notes |
|---|---|---|
| `DATABASE_URL` | | asyncpg DSN; `?schema=` is stripped |
| `INTERNAL_SERVICE_TOKEN` | | required; same value as backend/.env |
| `EMBEDDING_BACKEND` | `hashing` | `sentence-transformers` in Docker |
| `ANTHROPIC_API_KEY` | | enables the Claude parser |
| `BRIEF_PARSER_MODEL` | `claude-sonnet-4-6` | |
| `REDIS_URL` | | Celery broker/result; unset → inline batches |
| `SCORING_MODEL` | `v1-formula` | `v2-xgboost` needs `MLFLOW_TRACKING_URI` |
| `MATCH_CANDIDATE_POOL` | 200 | ANN candidates before re-rank |
| `FRAUD_MIN_POPULATION` | 50 | Isolation Forest minimum |
| `FRAUD_HIGH_VALUE_DEAL_AMOUNT` | 50000 | INR |
| `FRAUD_FAILED_PAYMENT_THRESHOLD` | 3 | |
| `RUN_MIGRATIONS_ON_STARTUP` | true | |
| `TEST_DATABASE_URL` | `postgresql://hustl@localhost:5433/hustl_test` | tests only |
