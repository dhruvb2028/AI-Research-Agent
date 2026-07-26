"""Run history read from the JSONL traces the agent already writes.

No database: every run persists a trace file, so history is a read over
traces/. This keeps the UI honest — anything it shows about a past run came
from that run's own log.
"""
from __future__ import annotations

import json
from pathlib import Path

from app.tracing.trace_logger import TRACE_DIR


def _read_events(path: Path) -> list[dict]:
    events = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue  # a partially-flushed final line: skip, don't fail
    return events


def summarize(path: Path) -> dict | None:
    events = _read_events(path)
    if not events:
        return None
    start = next((e for e in events if e["type"] == "run_start"), None)
    end = next((e for e in events if e["type"] == "run_end"), None)
    if start is None:
        return None
    tool_calls = [e for e in events if e["type"] == "tool_call"]
    return {
        "run_id": start["run_id"],
        "question": start.get("question", ""),
        "model": start.get("model", ""),
        "started_at": start["ts"],
        "duration_s": round(events[-1]["ts"] - start["ts"], 1),
        "completed": end is not None,
        "budget_exhausted": bool(end and end.get("budget_exhausted")),
        "steps": end.get("steps") if end else None,
        "tool_calls": len(tool_calls),
        "retries": sum(1 for e in events if e["type"] == "llm_retry"),
        "est_cost_usd": (end or {}).get("est_cost_usd"),
        "prompt_tokens": (end or {}).get("prompt_tokens"),
        "completion_tokens": (end or {}).get("completion_tokens"),
    }


def list_runs(limit: int = 50, trace_dir: Path = TRACE_DIR) -> list[dict]:
    if not trace_dir.exists():
        return []
    files = sorted(trace_dir.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)
    out = []
    for f in files[:limit]:
        summary = summarize(f)
        if summary:
            out.append(summary)
    return out


def get_run(run_id: str, trace_dir: Path = TRACE_DIR) -> dict | None:
    """Full detail for one run: summary, persisted result, and its event log.

    Runs recorded before results were persisted return answer=None rather than
    a reconstruction — history reports what was logged, nothing more.
    """
    path = trace_dir / f"{run_id}.jsonl"
    if not path.exists():
        return None
    summary = summarize(path)
    if summary is None:
        return None

    events = _read_events(path)
    result = next((e for e in events if e["type"] == "result"), None)
    end = next((e for e in events if e["type"] == "run_end"), None)
    start = next((e for e in events if e["type"] == "run_start"), None)
    t0 = start["ts"] if start else events[0]["ts"]

    timeline = [
        {**e, "offset_s": round(e["ts"] - t0, 2)}
        for e in events
        if e["type"] in ("llm_call", "tool_call", "tool_error", "llm_retry")
    ]

    return {
        **summary,
        "max_steps": (start or {}).get("max_steps"),
        "answer": (result or {}).get("answer"),
        "evidence": (result or {}).get("evidence", []),
        "trace": {
            k: (end or {}).get(k)
            for k in (
                "llm_calls",
                "llm_seconds",
                "tool_calls",
                "tool_seconds",
                "prompt_tokens",
                "completion_tokens",
                "est_cost_usd",
            )
        },
        "timeline": timeline,
    }
