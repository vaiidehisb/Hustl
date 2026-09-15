import numpy as np

from app.config import strip_schema_param
from app.services.embedding import HashingEmbedder, tokenize
from app.services.embedding_text import brief_text, content_hash, creator_text
from app.utils.mathx import cosine, minmax
from app.utils.niches import canonical_niche, niche_overlap


def test_strip_schema_param():
    assert strip_schema_param("postgresql://u@h:5433/db?schema=public") == "postgresql://u@h:5433/db"
    assert strip_schema_param("postgresql://u@h/db?sslmode=require&schema=x") == "postgresql://u@h/db?sslmode=require"
    assert strip_schema_param("") == ""


def test_hashing_embedder_is_deterministic_and_normalised():
    emb = HashingEmbedder()
    a = emb.embed(["Skincare reels for Gen Z", "Skincare reels for Gen Z"])
    assert a.shape == (2, 384)
    assert np.allclose(a[0], a[1])
    assert abs(np.linalg.norm(a[0]) - 1.0) < 1e-9


def test_hashing_embedder_synonym_expansion_ranks_related_text_higher():
    emb = HashingEmbedder()
    brief, beauty, finance = emb.embed([
        "makeup and skincare campaign on instagram",
        "beauty creator sharing cosmetics tutorials",
        "stock market investing tips",
    ])
    assert cosine(brief, beauty) > cosine(brief, finance)


def test_empty_text_gives_zero_vector_not_nan():
    v = HashingEmbedder().embed([""])[0]
    assert not np.isnan(v).any() and np.linalg.norm(v) == 0


def test_tokenize_matches_ts_rules():
    assert tokenize("The Reels, and STORIES!") == ["reel", "storie"]


def test_text_builders_use_real_fields_and_hash_changes_with_model():
    profile = {"headline": "Fitness coach", "bio": "Home workouts", "niches": ["fitness"], "location": "Pune",
               "languages": ["hi"], "portfolio": [{"title": "Nike collab", "brand": "Nike"}], "rate_card": []}
    text = creator_text(profile, [{"platform": "INSTAGRAM"}])
    assert "Fitness coach" in text and "instagram" in text and "Nike" in text
    b = brief_text({"title": "T", "description": "D", "requirements": "R", "niche": "tech", "platforms": ["YOUTUBE"]})
    assert b.startswith("T D R")
    assert content_hash("m1", text) != content_hash("m2", text)


def test_niche_helpers():
    assert canonical_niche("Skincare") == "beauty"
    assert canonical_niche("Personal Finance") == "finance"
    assert niche_overlap(["beauty"], ["makeup"]) == 1.0
    assert niche_overlap(["tech"], ["beauty"]) == 0.0
    assert niche_overlap(["tech"], []) is None
    assert minmax(5, 0, 10) == 0.5 and minmax(20, 0, 10) == 1.0
