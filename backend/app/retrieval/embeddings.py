"""Gemini embeddings with MRL truncation and a content-hash cache.

The cache makes ingest idempotent: unchanged chunks never hit the API again,
which respects the ~1,000 req/day free quota and makes re-ingests near-free.
Truncated MRL vectors must be re-normalized to unit length or cosine scores
degrade — that's not optional.
"""
from __future__ import annotations

import hashlib
import json
import math

import httpx

from app.config import EMBED_DIM, GOOGLE_API_KEY, REPO_ROOT

EMBED_MODEL = "gemini-embedding-001"
EMBED_ENDPOINT = (
    f"https://generativelanguage.googleapis.com/v1beta/models/{EMBED_MODEL}:batchEmbedContents"
)
CACHE_DIR = REPO_ROOT / ".embedding_cache"
BATCH_SIZE = 20


class EmbeddingError(Exception):
    pass


def _normalize(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def _cache_key(text: str, dim: int) -> str:
    return hashlib.sha256(f"{EMBED_MODEL}:{dim}:{text}".encode()).hexdigest()


def _embed_batch_api(texts: list[str], dim: int, task_type: str) -> list[list[float]]:
    if not GOOGLE_API_KEY:
        raise EmbeddingError("GOOGLE_API_KEY missing from .env")
    resp = httpx.post(
        EMBED_ENDPOINT,
        params={"key": GOOGLE_API_KEY},
        json={
            "requests": [
                {
                    "model": f"models/{EMBED_MODEL}",
                    "content": {"parts": [{"text": t}]},
                    "outputDimensionality": dim,
                    "taskType": task_type,
                }
                for t in texts
            ]
        },
        timeout=60,
    )
    if resp.status_code != 200:
        raise EmbeddingError(f"Gemini embeddings returned {resp.status_code}: {resp.text[:300]}")
    return [_normalize(e["values"]) for e in (r for r in resp.json()["embeddings"])]


def embed_texts(
    texts: list[str],
    dim: int = EMBED_DIM,
    task_type: str = "RETRIEVAL_DOCUMENT",
    use_cache: bool = True,
    _api=_embed_batch_api,
) -> list[list[float]]:
    """Embed texts, serving unchanged content from the local cache."""
    CACHE_DIR.mkdir(exist_ok=True)
    out: list[list[float] | None] = [None] * len(texts)
    misses: list[int] = []

    for i, t in enumerate(texts):
        cache_file = CACHE_DIR / f"{_cache_key(t, dim)}.json"
        if use_cache and cache_file.exists():
            out[i] = json.loads(cache_file.read_text())
        else:
            misses.append(i)

    for b in range(0, len(misses), BATCH_SIZE):
        batch_idx = misses[b : b + BATCH_SIZE]
        vectors = _api([texts[i] for i in batch_idx], dim, task_type)
        for i, vec in zip(batch_idx, vectors):
            out[i] = vec
            if use_cache:
                (CACHE_DIR / f"{_cache_key(texts[i], dim)}.json").write_text(json.dumps(vec))

    return out  # type: ignore[return-value]


def embed_query(text: str, dim: int = EMBED_DIM) -> list[float]:
    # Queries use the matching asymmetric task type and skip the cache (low reuse).
    return embed_texts([text], dim=dim, task_type="RETRIEVAL_QUERY", use_cache=False)[0]
