-- Embedding tables, fallback variant (no pgvector): double precision[] + cosine in numpy.
-- Applied only when the `vector` extension is NOT available.
CREATE TABLE IF NOT EXISTS ai.creator_embeddings (
    id            uuid PRIMARY KEY,           -- creator_profiles.id
    model         text NOT NULL,
    dims          integer NOT NULL,
    embedding     double precision[] NOT NULL,
    content_hash  text NOT NULL,
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creator_embeddings_model_idx ON ai.creator_embeddings (model);

CREATE TABLE IF NOT EXISTS ai.brief_embeddings (
    id            uuid PRIMARY KEY,           -- briefs.id
    model         text NOT NULL,
    dims          integer NOT NULL,
    embedding     double precision[] NOT NULL,
    content_hash  text NOT NULL,
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS brief_embeddings_model_idx ON ai.brief_embeddings (model);
