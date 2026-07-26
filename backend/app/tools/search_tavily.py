"""Tavily web search tool — returns results normalized to the shared evidence shape."""
from __future__ import annotations

import os

import httpx

from app.tools.base import SearchError

TAVILY_ENDPOINT = "https://api.tavily.com/search"


def search_web(query: str, max_results: int = 5, timeout: float = 15.0) -> list[dict]:
    """Search the web via Tavily.

    Returns a list of {url, title, snippet, source} dicts — the normalized shape
    every search provider in the fallback chain must produce.
    """
    api_key = os.getenv("TAVILY_API_KEY", "")
    if not api_key:
        raise SearchError("TAVILY_API_KEY missing from .env")

    try:
        resp = httpx.post(
            TAVILY_ENDPOINT,
            json={
                "api_key": api_key,
                "query": query,
                "max_results": max_results,
                "include_answer": False,
            },
            timeout=timeout,
        )
    except httpx.HTTPError as e:
        # DNS failures, timeouts, resets — degrade to a provider failure so the
        # chain rolls over instead of the whole agent run erroring out.
        raise SearchError(f"Tavily network error: {type(e).__name__}: {e}") from e
    if resp.status_code != 200:
        raise SearchError(f"Tavily returned {resp.status_code}: {resp.text[:200]}")

    return [
        {
            "url": r.get("url", ""),
            "title": r.get("title", ""),
            "snippet": r.get("content", ""),
            "source": "tavily",
            # Tavily returns a real relevance score; never invent one for
            # providers that don't (see search_serper).
            "score": r.get("score"),
        }
        for r in resp.json().get("results", [])
        if r.get("url")
    ]
