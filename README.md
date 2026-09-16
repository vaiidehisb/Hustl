# hustl.

**Brand deals, secured. Payments, guaranteed.**

A two-sided creator–brand marketplace: brands post briefs and find creators through AI matching, creators find brand deals, and every deal runs through a server-enforced lifecycle — offer → negotiation → contract → escrow funding → milestone delivery → approval → payout — with disputes and a 72-hour dispute window.

```
Next.js (frontend)
      │  server-side fetch, session token
      ▼
API Gateway :4000 ── JWT pre-check · rate limits · routing · CORS
      │
      ├── user :4001          auth, profiles, KYC/verification
      ├── deal :4002          briefs, applications, offers, contracts, milestones, reviews
      ├── payment :4003       escrow, ledger, payouts, disputes (Stripe / Razorpay / test)
      ├── creator-data :4004  social accounts (Phyllo), metrics, scores, fraud flags
      ├── search :4005        creator + brief search (Elasticsearch, Postgres fallback)
      ├── notification :4006  conversations, messages, notifications, Socket.io, email
      ├── analytics :4007     brand / creator / deal / platform analytics
      └── media :4008         uploads (S3 or local), contract PDFs, media kits
                   │ internal only
                   ▼
            AI backend :8000 (FastAPI)
            matching · creator scoring · brief parser · fraud detection · application scoring
                   │
            PostgreSQL · (Redis · Kafka · Elasticsearch optional)
```

The browser never talks to a service or to the AI backend directly. Services own their own tables and talk to each other over REST plus an event bus.

## Requirements

- Node 20+, npm 10+
- PostgreSQL 16+
- Python 3.11+ (AI backend)
- Optional: Docker, Redis, Kafka, Elasticsearch — everything runs without them (see *Fallbacks*)

## Quick start (local, no Docker)

```bash
# 1. dependencies
npm --prefix backend install
npm --prefix frontend install
python -m pip install -r ai-backend/requirements-dev.txt

# 2. env — copy and fill in
cp .env.example .env
cp .env.example backend/.env
cp frontend/.env.example frontend/.env.local
cp ai-backend/.env.example ai-backend/.env

# 3. database
npm run db:start                         # local PostgreSQL on :5433 (optional — skip if you have your own)
npm --prefix backend run db:migrate      # Prisma migrations (public schema)
python -m app.db.migrate                 # AI schema, run from ai-backend/

# 4. run everything
npm --prefix backend run dev             # gateway + 8 services
cd ai-backend && python -m uvicorn app.main:app --reload --port 8000
npm --prefix frontend run dev            # http://localhost:3000
```

First admin (admins cannot self-register):

```bash
npm --prefix backend run admin:create -- --email ops@yourdomain.com --name "Ops"
```

There is **no seed data** — every record comes from real use of the app.

## Docker

```bash
cp .env.example .env
docker compose up --build          # postgres, redis, kafka, elasticsearch, all services, AI, frontend
docker compose down
```

Production runs the same compose file with the overrides in `docker-compose.prod.yml`, pointed at managed infrastructure:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Commands

| | |
|---|---|
| `npm --prefix backend run dev` | gateway + every service (individually: `dev:user`, `dev:deal`, `dev:payment`, `dev:creator`, `dev:search`, `dev:notification`, `dev:analytics`, `dev:media`, `dev:gateway`) |
| `npm --prefix backend run build` / `start` | compile / run all services (`start:user` … per service) |
| `npm --prefix backend run test` | backend test suite |
| `npm --prefix backend run test:e2e` | full deal lifecycle through the running gateway |
| `npm --prefix backend run db:migrate` / `db:migrate:dev` | apply / create migrations |
| `npm run db:start` / `db:stop` / `db:status` | a throwaway local PostgreSQL cluster on :5433 (trust auth, no password) for development |
| `npm --prefix frontend run dev` / `build` / `start` / `test` | the Next.js app |
| `cd ai-backend && python -m pytest -q` | AI backend tests |
| `cd ai-backend && celery -A app.workers.celery_app worker` | AI batch jobs (needs `REDIS_URL`) |

## Fallbacks when infrastructure is missing

| Missing | Behaviour |
|---|---|
| Kafka | Events go through the transactional outbox table; consumers poll it with per-consumer offsets. Same at-least-once semantics. |
| Elasticsearch | Search runs on PostgreSQL. Responses report `meta.engine`. |
| Redis | Socket.io runs single-node; AI batch endpoints run inline and report `mode: "inline"`. |
| pgvector | Embeddings are stored as arrays and cosine similarity is computed in NumPy. `/health` reports `vector_backend`. |
| sentence-transformers | `EMBEDDING_BACKEND=hashing` uses a deterministic 384-dim hashing encoder; responses report `embedding_model`. |
| Stripe / Razorpay keys | `PAYMENTS_PROVIDER=test` simulates the provider through the same code path. Refused when `NODE_ENV=production`. |
| Phyllo keys | Social endpoints return `503 INTEGRATION_UNAVAILABLE`, naming the missing variables. Creators can still enter self-reported metrics, always labelled unverified. |
| SendGrid key | In-app notifications only; email is skipped and logged once at startup. |
| Anthropic key | The brief parser falls back to a deterministic rule parser and reports `source: "rules"`. |

Nothing is ever faked: a missing integration is reported as unavailable rather than filled with invented data.

## Conventions

- Responses: `{ success: true, data, meta? }` or `{ success: false, error: { code, message, details? } }`.
- Error codes: `VALIDATION_ERROR` (422), `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT` (409, invalid state transitions), `RATE_LIMITED`, `INTEGRATION_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, `TIMEOUT`, `INTERNAL_ERROR`.
- Money is whole INR rupees; providers convert at the boundary. Engagement rates are fractions (`0.042` = 4.2%).
- Validation runs on both sides: zod schemas in `backend/packages/contracts` are shared by the services and the frontend, with database constraints underneath.

## Documentation

- `backend/API.md` — every endpoint, per service, plus events
- `backend/packages/db/prisma/schema.prisma` — data model, with table ownership noted per model
- `ai-backend/README.md` — AI modules, models and environment
- `.env.example` — every environment variable, grouped by requirement
