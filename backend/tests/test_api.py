"""API tests: health + SSE stream shape, agent fully mocked."""
import json

from fastapi.testclient import TestClient

import app.main as main_module
from app.agent.orchestrator import AgentResult
from app.main import app


def _fake_agent(question, tracer=None, on_event=None):
    on_event("start", {"question": question})
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


def test_research_streams_events(monkeypatch):
    monkeypatch.setattr(main_module, "run_agent", _fake_agent)
    resp = TestClient(app).post("/research", json={"question": "test question"})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")
    events = _parse_sse(resp.text)
    types = [t for t, _ in events]
    assert types == ["start", "tool", "done"]
    assert events[-1][1]["answer"] == "answer [1]"


def test_research_streams_error_event(monkeypatch):
    def boom(question, tracer=None, on_event=None):
        raise RuntimeError("agent exploded")

    monkeypatch.setattr(main_module, "run_agent", boom)
    resp = TestClient(app).post("/research", json={"question": "test question"})
    events = _parse_sse(resp.text)
    assert events[-1][0] == "error"
    assert "agent exploded" in events[-1][1]["message"]


def test_research_rejects_bad_input():
    assert TestClient(app).post("/research", json={"question": ""}).status_code == 422
