"""Run-history summarization over trace files — no network."""
import json

from app.runs import get_run, list_runs, summarize


def _write_trace(dir_, run_id, events):
    p = dir_ / f"{run_id}.jsonl"
    p.write_text("\n".join(json.dumps(e) for e in events), encoding="utf-8")
    return p


def test_summarize_completed_run(tmp_path):
    p = _write_trace(
        tmp_path,
        "abc123",
        [
            {"ts": 100.0, "run_id": "abc123", "type": "run_start", "question": "q?", "model": "m"},
            {"ts": 101.0, "run_id": "abc123", "type": "llm_retry", "attempt": 1},
            {"ts": 105.0, "run_id": "abc123", "type": "tool_call", "tool": "search_web"},
            {"ts": 110.0, "run_id": "abc123", "type": "run_end", "steps": 2,
             "budget_exhausted": False, "est_cost_usd": 0.002},
        ],
    )
    s = summarize(p)
    assert s["run_id"] == "abc123"
    assert s["duration_s"] == 10.0
    assert s["completed"] is True
    assert s["tool_calls"] == 1
    assert s["retries"] == 1


def test_incomplete_run_marked_not_completed(tmp_path):
    p = _write_trace(
        tmp_path,
        "def456",
        [{"ts": 1.0, "run_id": "def456", "type": "run_start", "question": "q", "model": "m"}],
    )
    assert summarize(p)["completed"] is False


def test_partial_final_line_is_skipped(tmp_path):
    p = tmp_path / "ghi.jsonl"
    p.write_text(
        json.dumps({"ts": 1.0, "run_id": "ghi", "type": "run_start", "question": "q"})
        + '\n{"ts": 2.0, "type": "tool_ca',
        encoding="utf-8",
    )
    assert summarize(p)["run_id"] == "ghi"


def test_list_and_get(tmp_path):
    _write_trace(tmp_path, "r1", [{"ts": 1.0, "run_id": "r1", "type": "run_start", "question": "a"}])
    _write_trace(tmp_path, "r2", [{"ts": 2.0, "run_id": "r2", "type": "run_start", "question": "b"}])
    assert len(list_runs(trace_dir=tmp_path)) == 2
    assert get_run("r1", trace_dir=tmp_path)["question"] == "a"
    assert get_run("nope", trace_dir=tmp_path) is None


def test_get_run_returns_persisted_result_and_timeline(tmp_path):
    _write_trace(
        tmp_path,
        "full1",
        [
            {"ts": 100.0, "run_id": "full1", "type": "run_start", "question": "q?",
             "model": "m", "max_steps": 6},
            {"ts": 102.0, "run_id": "full1", "type": "llm_call", "model": "m",
             "latency_s": 2.0, "prompt_tokens": 10, "completion_tokens": 5},
            {"ts": 103.0, "run_id": "full1", "type": "tool_call", "tool": "search_web",
             "latency_s": 1.0, "query": "x", "results": 3, "provider": "tavily"},
            {"ts": 108.0, "run_id": "full1", "type": "result", "answer": "The answer [1].",
             "evidence": [{"url": "https://a.com", "title": "A", "snippet": "s", "source": "tavily"}]},
            {"ts": 108.1, "run_id": "full1", "type": "run_end", "steps": 2,
             "budget_exhausted": False, "llm_calls": 1, "est_cost_usd": 0.001},
        ],
    )
    run = get_run("full1", trace_dir=tmp_path)
    assert run["answer"] == "The answer [1]."
    assert run["evidence"][0]["url"] == "https://a.com"
    assert run["max_steps"] == 6
    assert run["trace"]["llm_calls"] == 1
    # Timeline keeps only activity events, stamped with offsets from run start.
    assert [e["type"] for e in run["timeline"]] == ["llm_call", "tool_call"]
    assert run["timeline"][0]["offset_s"] == 2.0


def test_get_run_without_persisted_result_reports_none(tmp_path):
    _write_trace(
        tmp_path,
        "old1",
        [{"ts": 1.0, "run_id": "old1", "type": "run_start", "question": "q", "model": "m"}],
    )
    run = get_run("old1", trace_dir=tmp_path)
    assert run["answer"] is None
    assert run["evidence"] == []
