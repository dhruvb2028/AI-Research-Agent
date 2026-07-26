"""CLI entry point:  python -m app.cli "your research question" """
from __future__ import annotations

import sys

from app.agent.orchestrator import run_agent


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit('usage: python -m app.cli "your research question"')
    question = " ".join(sys.argv[1:])

    print(f"researching: {question}\n")
    result = run_agent(question)

    print(result.answer)
    if result.evidence:
        print("\nsources:")
        for i, ev in enumerate(result.evidence, 1):
            print(f"  [{i}] {ev['title']} — {ev['url']}")
    if result.budget_exhausted:
        print("\n(note: step budget reached — answer may be incomplete)")


if __name__ == "__main__":
    main()
