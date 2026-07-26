"""Serper.dev search tool — Google SERP results, normalized to the shared evidence shape.

Serper's free allowance is a one-time 2,500-credit pool (not monthly), so it sits
behind Tavily's renewable quota in the fallback chain.
"""
from __future__ import annotations

import os

import httpx

from app.tools.base import SearchError

SERPER_ENDPOINT = "https://google.serper.dev/search"


def search_web(query: str, max_results: int = 5, timeout: float = 15.0) -> list[dict]:
    api_key = os.getenv("SERPER_API_KEY", "")
    if not api_key:
        raise SearchError("SERPER_API_KEY missing from .env")

    resp = httpx.post(
        SERPER_ENDPOINT,
        headers={"X-API-KEY": api_key, "Content-Type": "application/json"},
        json={"q": query, "num": max_results},
        timeout=timeout,
    )
    if resp.status_code != 200:
        raise SearchError(f"Serper returned {resp.status_code}: {resp.text[:200]}")

    return [
        {
            "url": r.get("link", ""),
            "title": r.get("title", ""),
            "snippet": r.get("snippet", ""),
            "source": "serper",
        }
        for r in resp.json().get("organic", [])
        if r.get("link")
    ][:max_results]
