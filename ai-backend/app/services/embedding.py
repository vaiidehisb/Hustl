"""Embedding backends.

- `sentence-transformers`: all-MiniLM-L6-v2 (384-dim), lazy-loaded on first use.
- `hashing`: deterministic 384-dim feature hashing (bag of words + bigrams) with
  niche synonym expansion. Ported bit-for-bit from frontend/lib/ai/embed.ts so
  vectors agree with the TS prototype. For machines without torch.

Vectors from different backends live in different spaces, so every stored
vector carries its `model` and ANN queries filter on it.
"""

from __future__ import annotations

import asyncio
import re
import threading
from typing import Protocol

import numpy as np

from app.config import get_settings
from app.utils.errors import integration_unavailable
from app.utils.niches import NICHE_SYNONYMS

HASHING_MODEL_NAME = "hashing-v1-384"

STOPWORDS = frozenset(
    "a an and are as at be but by for from has have in into is it its of on or our that the their this to we "
    "with you your will who need needs looking want per each all any can more".split()
)

# Platform shorthands (from the TS prototype) on top of the niche synonyms.
EMBED_SYNONYMS: dict[str, str] = {
    **NICHE_SYNONYMS,
    "reel": "reels", "reels": "instagram", "insta": "instagram", "ig": "instagram",
    "shorts": "youtube", "yt": "youtube", "vlog": "youtube",
}

_NON_ALNUM = re.compile(r"[^a-z0-9\s]")


class Embedder(Protocol):
    name: str
    dims: int

    def embed(self, texts: list[str]) -> np.ndarray: ...


def _fnv1a(s: str) -> int:
    h = 2166136261
    for ch in s:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def tokenize(text: str) -> list[str]:
    cleaned = _NON_ALNUM.sub(" ", text.lower())
    out = []
    for t in cleaned.split():
        if len(t) <= 1 or t in STOPWORDS:
            continue
        out.append(t[:-1] if len(t) > 4 and t.endswith("s") else t)
    return out


class HashingEmbedder:
    name = HASHING_MODEL_NAME

    def __init__(self, dims: int = 384) -> None:
        self.dims = dims

    def _one(self, text: str) -> np.ndarray:
        vec = np.zeros(self.dims, dtype=np.float64)
        toks = tokenize(text)

        def add(feature: str, weight: float) -> None:
            h = _fnv1a(feature)
            vec[h % self.dims] += (1.0 if h & 1 else -1.0) * weight

        for i, t in enumerate(toks):
            add(t, 1.0)
            syn = EMBED_SYNONYMS.get(t)
            if syn:
                add(syn, 1.5)
            if i > 0:
                add(f"{toks[i - 1]}_{t}", 0.5)
        norm = np.linalg.norm(vec)
        return vec / norm if norm > 0 else vec

    def embed(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dims))
        return np.vstack([self._one(t) for t in texts])


class SentenceTransformerEmbedder:
    def __init__(self, model_name: str, dims: int = 384) -> None:
        self.model_name = model_name
        self.name = model_name.split("/")[-1]
        self.dims = dims
        self._model = None
        self._lock = threading.Lock()
        self.load_error: str | None = None

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def _load(self):
        if self._model is None:
            with self._lock:
                if self._model is None:
                    try:
                        from sentence_transformers import SentenceTransformer  # heavy, lazy
                    except ImportError as exc:
                        self.load_error = "sentence-transformers is not installed"
                        raise integration_unavailable(
                            "sentence-transformers", reason="package not installed; set EMBEDDING_BACKEND=hashing"
                        ) from exc
                    self._model = SentenceTransformer(self.model_name)
        return self._model

    def embed(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dims))
        model = self._load()
        vecs = model.encode(texts, normalize_embeddings=True, convert_to_numpy=True)
        return np.asarray(vecs, dtype=np.float64)


_embedder: Embedder | None = None
_embedder_lock = threading.Lock()


def get_embedder() -> Embedder:
    global _embedder
    if _embedder is None:
        with _embedder_lock:
            if _embedder is None:
                s = get_settings()
                if s.embedding_backend == "sentence-transformers":
                    _embedder = SentenceTransformerEmbedder(s.sentence_transformer_model, s.embedding_dims)
                else:
                    _embedder = HashingEmbedder(s.embedding_dims)
    return _embedder


def reset_embedder() -> None:
    global _embedder
    _embedder = None


async def aembed(texts: list[str]) -> np.ndarray:
    emb = get_embedder()
    if isinstance(emb, HashingEmbedder):
        return emb.embed(texts)  # microseconds; no thread hop
    return await asyncio.to_thread(emb.embed, texts)


def embedding_status() -> dict:
    s = get_settings()
    emb = get_embedder()
    status = {"backend": s.embedding_backend, "model": emb.name, "dims": emb.dims}
    if isinstance(emb, SentenceTransformerEmbedder):
        status["loaded"] = emb.loaded
        try:
            import importlib.util

            status["installed"] = importlib.util.find_spec("sentence_transformers") is not None
        except (ImportError, ValueError):
            status["installed"] = False
        if emb.load_error:
            status["error"] = emb.load_error
    else:
        status["loaded"] = True
    return status
