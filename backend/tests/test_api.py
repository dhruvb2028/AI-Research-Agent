"""API tests: health, config, SSE stream shape, runs and evals — agent mocked, no network."""
import json

from fastapi.testclient import TestClient

import app.main as main_module
from app.agent.orchestrator import AgentResult
from app.main import app


def _fake_agent(question, tracer=None, on_event=None, max_steps=6, enabled_tools=None):
    on_event("start", {"question": question, "max_steps": max_steps, "tools": enabled_tools})
    on_event("llm", {"model": "m", "latency_s": 1.0, "prompt_tokens": 10, "completion_tokens": 5})
    on_event("tool", {"step": 1, "tool": "search_web", "new_evidence": [{"url": "https://a.com"}]})
    return AgentResult(answer="answer [1]", evidence=[{"url": "https://a.com"}], steps=2)


def _parse_sse(text: str) -> list[tuple[str, dict]]:
    events = []
    for block in text.strip().split("\n\n"):
        lines = dict(l.split(": ", 1) for l in block.splitlines())
        events.append((lines["event"], json.loads(lines["data"])))
    return events


def test_health():
    assert TestClient(app).get("/health").json() == {"status": "ok"}


def test_config_reports_live_settings():
    cfg = TestClient(app).get("/config").json()
    assert cfg["depth_budgets"] == {"quick": 3, "standard": 6, "deep": 12}
    assert cfg["model"]


def test_research_streams_events(monkeypatch):
    monkeypatch.setattr(main_module, "run_agent", _fake_agent)
    resp = TestClient(app).post("/research", json={"question": "test question"})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")
    types = [t for t, _ in _parse_sse(resp.text)]
    assert types == ["run_id", "start", "llm", "tool", "done"]


def test_research_passes_depth_and_tools(monkeypatch):
    seen = {}

    def spy(question, tracer=None, on_event=None, max_steps=6, enabled_tools=None):
        seen["max_steps"] = max_steps
        seen["tools"] = enabled_tools
        return AgentResult(answer="a", evidence=[], steps=1)

    monkeypatch.setattr(main_module, "run_agent", spy)
    TestClient(app).post(
        "/research",
        json={"question": "a real question", "depth": "deep", "tools": ["search_corpus"]},
    )
    assert seen == {"max_steps": 12, "tools": ["search_corpus"]}


def test_research_streams_error_event(monkeypatch):
    def boom(question, **kwargs):
        raise RuntimeError("agent exploded")

    monkeypatch.setattr(main_module, "run_agent", boom)
    events = _parse_sse(TestClient(app).post("/research", json={"question": "a real question"}).text)
    assert events[-1][0] == "error"
    assert "agent exploded" in events[-1][1]["message"]


def test_research_rejects_bad_input():
    client = TestClient(app)
    assert client.post("/research", json={"question": ""}).status_code == 422
    assert client.post("/research", json={"question": "a real question", "depth": "nope"}).status_code == 422


def test_runs_and_evals_endpoints_return_lists():
    client = TestClient(app)
    assert isinstance(client.get("/runs").json(), list)
    assert isinstance(client.get("/evals").json(), list)
    assert client.get("/runs/does-not-exist").status_code == 404
    assert client.get("/evals/does-not-exist").status_code == 404
