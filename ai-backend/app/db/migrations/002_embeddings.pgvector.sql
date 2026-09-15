-- Embedding tables, pgvector variant: vector(384) + HNSW cosine index.
-- Applied only when `vector` is listed in pg_available_extensions.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS ai.creator_embeddings (
    id            uuid PRIMARY KEY,           -- creator_profiles.id
    model         text NOT NULL,
    dims          integer NOT NULL,
    embedding     vector(384) NOT NULL,
    content_hash  text NOT NULL,
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creator_embeddings_model_idx ON ai.creator_embeddings (model);
CREATE INDEX IF NOT EXISTS creator_embeddings_hnsw_idx
    ON ai.creator_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS ai.brief_embeddings (
    id            uuid PRIMARY KEY,           -- briefs.id
    model         text NOT NULL,
    dims          integer NOT NULL,
    embedding     vector(384) NOT NULL,
    content_hash  text NOT NULL,
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS brief_embeddings_model_idx ON ai.brief_embeddings (model);
CREATE INDEX IF NOT EXISTS brief_embeddings_hnsw_idx
    ON ai.brief_embeddings USING hnsw (embedding vector_cosine_ops);
