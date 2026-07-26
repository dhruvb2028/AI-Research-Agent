"""Provider fallback chain for web search.

Ordering is deliberate: renewable monthly quotas (Tavily) burn before finite
credit pools (Serper's one-time 2,500) — spend income before savings. A provider
failing (quota, outage, missing key) rolls over to the next; only if every
provider fails does the caller see a SearchError, which the agent loop already
feeds back to the model as a recoverable tool error.
"""
from __future__ import annotations

from app.tools import search_serper, search_tavily
from app.tools.base import SearchError

PROVIDER_CHAIN = [
    ("tavily", search_tavily.search_web),
    ("serper", search_serper.search_web),
]


def search_web(query: str, max_results: int = 5, providers=None) -> list[dict]:
    failures = []
    for name, fn in providers or PROVIDER_CHAIN:
        try:
            results = fn(query, max_results=max_results)
        except SearchError as e:
            failures.append(f"{name}: {e}")
            continue
        if results:
            return results
        failures.append(f"{name}: returned no results")
    raise SearchError("all providers failed — " + "; ".join(failures))
