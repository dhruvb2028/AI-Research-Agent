"""Corpus retrieval tool: embed query -> Pinecone top-K -> hosted rerank -> top-N.

Results use the same normalized evidence shape as web search so the evidence
store and citation pipeline treat both sources identically.
"""
from __future__ import annotations

from app.config import RERANK_TOP_N, RETRIEVE_TOP_K
from app.retrieval.embeddings import EmbeddingError, embed_query
from app.retrieval.pinecone_store import PineconeStore
from app.tools.base import SearchError

_store: PineconeStore | None = None


def _get_store() -> PineconeStore:
    global _store
    if _store is None:
        _store = PineconeStore()
    return _store


def search_corpus(query: str, top_k: int = RETRIEVE_TOP_K, top_n: int = RERANK_TOP_N) -> list[dict]:
    try:
        vector = embed_query(query)
        candidates = _get_store().query(vector, top_k=top_k)
    except EmbeddingError as e:
        raise SearchError(f"corpus embedding failed: {e}") from e
    except Exception as e:  # noqa: BLE001 — network/SDK failures degrade like any provider
        raise SearchError(f"corpus query failed: {type(e).__name__}: {e}") from e

    if not candidates:
        return []
    top, reranker = _get_store().rerank(query, candidates, top_n=top_n)
    return [
        {
            "url": f"corpus://{c['doc']}#chunk{c['chunk_index']}",
            "title": c["doc"],
            # Full chunk text: corpus chunks are the evidence itself — truncating
            # them cost a live run its answer (the fact was cut mid-sentence).
            "snippet": c["text"],
            "source": f"corpus/{reranker}",
        }
        for c in top
    ]
