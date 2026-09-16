-- ai schema bootstrap (idempotent). Owned by the AI backend only.
CREATE SCHEMA IF NOT EXISTS ai;

CREATE TABLE IF NOT EXISTS ai.schema_migrations (
    name        text PRIMARY KEY,
    applied_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai.brief_parse_cache (
    input_hash   text PRIMARY KEY,           -- sha256 of normalised input + parser engine
    source       text NOT NULL,              -- claude | rules
    model        text,                       -- Claude model id when source = claude
    result       jsonb NOT NULL,
    hit_count    integer NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now(),
    last_hit_at  timestamptz
);
