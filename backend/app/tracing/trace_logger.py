"""JSONL run traces: every LLM call, tool call, token count, and would-be cost.

One file per run under traces/. This is the observability backbone — the CLI
summary, the latency investigation, and the eval harness all read these events.
"""
from __future__ import annotations

import json
import time
import uuid
from pathlib import Path

from app.config import DATA_DIR

TRACE_DIR = DATA_DIR / "traces"

# Would-be cost per 1M tokens (input, output) in USD if these open models were
# bought from a typical paid host — actual spend on NIM's free tier is $0.
# We track it anyway: cost-awareness has to exist before it's needed.
MODEL_PRICES_PER_M = {
    "meta/llama-3.3-70b-instruct": (0.60, 0.70),
    "meta/llama-3.1-8b-instruct": (0.05, 0.08),
    "deepseek-ai/deepseek-v4-flash": (0.30, 1.20),  # rough paid-host estimate
}


class Tracer:
    def __init__(self, run_id: str | None = None, trace_dir: Path = TRACE_DIR):
        self.run_id = run_id or uuid.uuid4().hex[:12]
        trace_dir.mkdir(parents=True, exist_ok=True)
        self.path = trace_dir / f"{self.run_id}.jsonl"
        # In-memory rollups for the end-of-run summary.
        self.llm_seconds = 0.0
        self.tool_seconds = 0.0
        self.llm_calls = 0
        self.tool_calls = 0
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.est_cost_usd = 0.0

    def event(self, type_: str, **fields) -> None:
        record = {"ts": round(time.time(), 3), "run_id": self.run_id, "type": type_, **fields}
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    def llm_call(self, model: str, latency_s: float, prompt_tokens: int, completion_tokens: int) -> None:
        in_price, out_price = MODEL_PRICES_PER_M.get(model, (0.0, 0.0))
        cost = (prompt_tokens * in_price + completion_tokens * out_price) / 1_000_000
        self.llm_calls += 1
        self.llm_seconds += latency_s
        self.prompt_tokens += prompt_tokens
        self.completion_tokens += completion_tokens
        self.est_cost_usd += cost
        self.event(
            "llm_call",
            model=model,
            latency_s=round(latency_s, 2),
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            est_cost_usd=round(cost, 6),
        )

    def tool_call(self, tool: str, latency_s: float, **fields) -> None:
        self.tool_calls += 1
        self.tool_seconds += latency_s
        self.event("tool_call", tool=tool, latency_s=round(latency_s, 2), **fields)

    def summary(self) -> dict:
        return {
            "llm_calls": self.llm_calls,
            "llm_seconds": round(self.llm_seconds, 2),
            "tool_calls": self.tool_calls,
            "tool_seconds": round(self.tool_seconds, 2),
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "est_cost_usd": round(self.est_cost_usd, 6),
        }


class NoopTracer(Tracer):
    """Keeps rollups in memory but writes nothing — used in tests."""

    def __init__(self):  # noqa: D107 — deliberately skips file setup
        self.run_id = "noop"
        self.path = None
        self.llm_seconds = self.tool_seconds = 0.0
        self.llm_calls = self.tool_calls = 0
        self.prompt_tokens = self.completion_tokens = 0
        self.est_cost_usd = 0.0

    def event(self, type_: str, **fields) -> None:
        pass
