"""CLI entry point:  python -m app.cli "your research question" """
from __future__ import annotations

import sys
import time

from app.agent.orchestrator import run_agent
from app.tracing.trace_logger import Tracer


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit('usage: python -m app.cli "your research question"')
    question = " ".join(sys.argv[1:])

    tracer = Tracer()
    print(f"researching: {question}\n", flush=True)
    start = time.time()
    result = run_agent(question, tracer=tracer)
    total = time.time() - start

    print(result.answer)
    if result.evidence:
        print("\nsources:")
        for i, ev in enumerate(result.evidence, 1):
            print(f"  [{i}] {ev['title']} — {ev['url']}")
    if result.budget_exhausted:
        print("\n(note: step budget reached — answer may be incomplete)")

    t = result.trace
    print(
        f"\n--- run stats ---\n"
        f"total: {total:.1f}s | llm: {t.get('llm_calls', 0)} calls, {t.get('llm_seconds', 0)}s"
        f" | tools: {t.get('tool_calls', 0)} calls, {t.get('tool_seconds', 0)}s\n"
        f"tokens: {t.get('prompt_tokens', 0)} in / {t.get('completion_tokens', 0)} out"
        f" | would-be cost: ${t.get('est_cost_usd', 0):.4f}\n"
        f"trace: {tracer.path}"
    )


if __name__ == "__main__":
    main()
