"""Pinecone vector store + hosted reranking with graceful degradation.

Rerank failover: Pinecone Inference (500/mo free) -> Cohere trial (1,000/mo)
-> no rerank. Reranking is a quality enhancer, never a dependency — quota
exhaustion costs a little precision on that query, never availability.
"""
from __future__ import annotations

import httpx
from pinecone import Pinecone, ServerlessSpec

from app.config import (
    COHERE_API_KEY,
    EMBED_DIM,
    PINECONE_API_KEY,
    PINECONE_INDEX,
    RERANK_ENABLED,
)

RERANK_MODEL = "bge-reranker-v2-m3"
COHERE_RERANK_ENDPOINT = "https://api.cohere.com/v2/rerank"


class PineconeStore:
    def __init__(self, index_name: str = PINECONE_INDEX, dim: int = EMBED_DIM):
        self._pc = Pinecone(api_key=PINECONE_API_KEY)
        self._dim = dim
        if not self._pc.has_index(index_name):
            self._pc.create_index(
                name=index_name,
                dimension=dim,
                metric="cosine",
                spec=ServerlessSpec(cloud="aws", region="us-east-1"),
            )
        self._index = self._pc.Index(index_name)

    def upsert_chunks(self, chunks: list[dict], vectors: list[list[float]]) -> int:
        payload = [
            {
                "id": c["id"],
                "values": v,
                "metadata": {"doc": c["doc"], "chunk_index": c["chunk_index"], "text": c["text"]},
            }
            for c, v in zip(chunks, vectors)
        ]
        for b in range(0, len(payload), 100):
            self._index.upsert(vectors=payload[b : b + 100])
        return len(payload)

    def query(self, vector: list[float], top_k: int) -> list[dict]:
        res = self._index.query(vector=vector, top_k=top_k, include_metadata=True)
        return [
            {
                "id": m["id"],
                "score": m["score"],
                "doc": m["metadata"]["doc"],
                "chunk_index": int(m["metadata"]["chunk_index"]),
                "text": m["metadata"]["text"],
            }
            for m in res["matches"]
        ]

    def rerank(self, query: str, candidates: list[dict], top_n: int) -> tuple[list[dict], str]:
        """Return (top_n candidates, reranker_used). Degrades, never raises."""
        if not RERANK_ENABLED or len(candidates) <= top_n:
            return candidates[:top_n], "disabled" if not RERANK_ENABLED else "skipped-small"
        docs = [c["text"] for c in candidates]
        try:
            rr = self._pc.inference.rerank(
                model=RERANK_MODEL, query=query, documents=docs, top_n=top_n
            )
            return [candidates[d.index] for d in rr.data], "pinecone"
        except Exception:  # noqa: BLE001 — any failure rolls to the next tier
            pass
        try:
            resp = httpx.post(
                COHERE_RERANK_ENDPOINT,
                headers={"Authorization": f"Bearer {COHERE_API_KEY}"},
                json={"model": "rerank-v3.5", "query": query, "documents": docs, "top_n": top_n},
                timeout=20,
            )
            resp.raise_for_status()
            order = [r["index"] for r in resp.json()["results"]]
            return [candidates[i] for i in order], "cohere"
        except Exception:  # noqa: BLE001
            return candidates[:top_n], "none"
