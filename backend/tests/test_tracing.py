"""Tests for the JSONL tracer and its integration with the agent loop."""
import json

from app.agent.orchestrator import run_agent
from app.tracing.trace_logger import NoopTracer, Tracer
from tests.test_orchestrator import FakeLLM, _msg, _tool_call, fake_search


def test_tracer_writes_jsonl_events(tmp_path):
    tracer = Tracer(run_id="test123", trace_dir=tmp_path)
    tracer.event("run_start", question="q")
    tracer.llm_call(model="meta/llama-3.3-70b-instruct", latency_s=1.5, prompt_tokens=100, completion_tokens=50)
    tracer.tool_call("search_web", 0.4, query="q", results=3)

    lines = [json.loads(l) for l in tracer.path.read_text().splitlines()]
    assert [l["type"] for l in lines] == ["run_start", "llm_call", "tool_call"]
    assert all(l["run_id"] == "test123" for l in lines)
    assert lines[1]["est_cost_usd"] > 0  # priced model accrues would-be cost


def test_tracer_rollups():
    tracer = NoopTracer()
    tracer.llm_call(model="unknown/model", latency_s=2.0, prompt_tokens=10, completion_tokens=5)
    tracer.llm_call(model="unknown/model", latency_s=3.0, prompt_tokens=20, completion_tokens=10)
    tracer.tool_call("search_web", 1.0)
    s = tracer.summary()
    assert s["llm_calls"] == 2
    assert s["llm_seconds"] == 5.0
    assert s["tool_calls"] == 1
    assert s["prompt_tokens"] == 30
    assert s["est_cost_usd"] == 0.0  # unknown model → unpriced


def test_agent_run_emits_lifecycle_events(tmp_path):
    tracer = Tracer(run_id="run1", trace_dir=tmp_path)
    llm = FakeLLM([_msg(tool_calls=[_tool_call("q1")]), _msg(content="done [1]")])
    result = run_agent("question", llm=llm, search=fake_search, tracer=tracer)

    types = [json.loads(l)["type"] for l in tracer.path.read_text().splitlines()]
    assert types[0] == "run_start"
    assert "tool_call" in types
    assert types[-1] == "run_end"
    assert result.trace["tool_calls"] == 1
