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
import os
import time

import httpx

from app.config import EMBED_DIM, GOOGLE_API_KEY, REPO_ROOT
from app.ratelimit import RateLimiter

EMBED_MODEL = "gemini-embedding-001"
EMBED_ENDPOINT = (
    f"https://generativelanguage.googleapis.com/v1beta/models/{EMBED_MODEL}:batchEmbedContents"
)
CACHE_DIR = REPO_ROOT / ".embedding_cache"
BATCH_SIZE = 20
MAX_ATTEMPTS = 4
BACKOFF_BASE_S = 2.0
# The free tier allows ~100 requests/minute; stay under it so a large document
# paces itself instead of being cut off part-way through indexing.
_LIMITER = RateLimiter(int(os.getenv("EMBED_MAX_RPM", "60")))


class EmbeddingError(Exception):
    pass


def _normalize(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def _cache_key(text: str, dim: int) -> str:
    return hashlib.sha256(f"{EMBED_MODEL}:{dim}:{text}".encode()).hexdigest()


def _retry_delay_from(body: dict) -> float | None:
    """Google returns a RetryInfo detail telling us exactly how long to wait."""
    for detail in body.get("error", {}).get("details", []):
        delay = detail.get("retryDelay")
        if isinstance(delay, str) and delay.endswith("s"):
            try:
                return float(delay[:-1])
            except ValueError:
                pass
    return None


class QuotaExhausted(EmbeddingError):
    """The daily embedding quota is gone; waiting minutes will not help."""


def _post_batch(texts: list[str], dim: int, task_type: str) -> httpx.Response:
    return httpx.post(
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


def _embed_batch_api(
    texts: list[str], dim: int, task_type: str, sleeper=time.sleep
) -> list[list[float]]:
    """Embed one batch, retrying rate limits with the delay Google asks for.

    A large document is many batches; without pacing they fire back to back and
    trip the per-minute quota immediately. Per-minute limits are retried; a
    daily exhaustion is raised straight away because backing off cannot fix it.
    """
    if not GOOGLE_API_KEY:
        raise EmbeddingError("GOOGLE_API_KEY missing from .env")

    for attempt in range(1, MAX_ATTEMPTS + 1):
        _LIMITER.acquire()
        resp = _post_batch(texts, dim, task_type)

        if resp.status_code == 200:
            return [_normalize(e["values"]) for e in resp.json()["embeddings"]]

        if resp.status_code == 429:
            body = resp.json() if resp.headers.get("content-type", "").startswith(
                "application/json"
            ) else {}
            message = body.get("error", {}).get("message", resp.text[:200])
            if "per day" in message.lower() or "daily" in message.lower():
                raise QuotaExhausted(
                    "the daily Gemini embedding quota is used up — indexing can "
                    "resume once it resets (Google resets daily quotas at midnight "
                    "Pacific time)"
                )
            if attempt == MAX_ATTEMPTS:
                raise EmbeddingError(
                    f"still rate limited after {MAX_ATTEMPTS} attempts: {message}"
                )
            sleeper(_retry_delay_from(body) or BACKOFF_BASE_S * 2 ** (attempt - 1))
            continue

        raise EmbeddingError(
            f"Gemini embeddings returned {resp.status_code}: {resp.text[:300]}"
        )

    raise EmbeddingError("embedding retries exhausted")  # pragma: no cover


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
