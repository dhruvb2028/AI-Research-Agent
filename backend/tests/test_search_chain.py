"""Unit tests for the search provider fallback chain — no network."""
import pytest

from app.tools.base import SearchError
from app.tools.search import search_web


def _ok(query, max_results=5):
    return [{"url": "https://a.com", "title": "t", "snippet": "s", "source": "ok"}]


def _fails(query, max_results=5):
    raise SearchError("quota exhausted")


def _empty(query, max_results=5):
    return []


def test_primary_serves_when_healthy():
    results = search_web("q", providers=[("p1", _ok), ("p2", _fails)])
    assert results[0]["source"] == "ok"


def test_falls_over_on_provider_error():
    results = search_web("q", providers=[("p1", _fails), ("p2", _ok)])
    assert results[0]["source"] == "ok"


def test_falls_over_on_empty_results():
    results = search_web("q", providers=[("p1", _empty), ("p2", _ok)])
    assert results[0]["source"] == "ok"


def test_all_failed_raises_with_reasons():
    with pytest.raises(SearchError) as exc:
        search_web("q", providers=[("p1", _fails), ("p2", _empty)])
    assert "p1: quota exhausted" in str(exc.value)
    assert "p2: returned no results" in str(exc.value)
