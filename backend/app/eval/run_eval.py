"""Eval runner: agent over the labeled set -> deterministic metrics + LLM-judge -> versioned report.

Usage (from backend/):
    python -m app.eval.run_eval --limit 8            # routine subset
    python -m app.eval.run_eval                      # full set (quota-expensive, run rarely)
    python -m app.eval.run_eval --category adversarial
    python -m app.eval.run_eval --label after-rerank # tag the report

Reports land in app/eval/reports/ as JSONL (per-item detail) + a markdown
summary. Reports are committed — they are the evidence trail behind every
"X% -> Y%" claim in the README and interviews.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

from app.agent.orchestrator import run_agent
from app.eval.judge import JUDGE_MODEL, judge_answer
from app.eval.metrics import citation_metrics
from app.tracing.trace_logger import Tracer

EVAL_SET = Path(__file__).with_name("eval_set.jsonl")
REPORTS_DIR = Path(__file__).with_name("reports")


def load_eval_set(category: str | None = None, limit: int | None = None) -> list[dict]:
    items = [json.loads(l) for l in EVAL_SET.read_text(encoding="utf-8").splitlines() if l.strip()]
    if category:
        items = [i for i in items if i["category"] == category]
    if limit:
        # Spread the subset across categories instead of taking the first N of one kind.
        by_cat: dict[str, list[dict]] = {}
        for i in items:
            by_cat.setdefault(i["category"], []).append(i)
        picked, idx = [], 0
        while len(picked) < limit and any(by_cat.values()):
            for cat in list(by_cat):
                if by_cat[cat] and len(picked) < limit:
                    picked.append(by_cat[cat].pop(0))
            idx += 1
        items = picked
    return items


def evaluate_item(item: dict) -> dict:
    tracer = Tracer()
    start = time.time()
    try:
        result = run_agent(item["question"], tracer=tracer)
        error = None
    except Exception as e:  # noqa: BLE001 — an eval run must survive individual failures
        return {
            "id": item["id"],
            "category": item["category"],
            "error": f"{type(e).__name__}: {e}",
            "latency_s": round(time.time() - start, 1),
        }

    verdict = judge_answer(item["question"], item["rubric"], result.answer, result.evidence)
    return {
        "id": item["id"],
        "category": item["category"],
        "question": item["question"],
        "answer": result.answer,
        "correctness": verdict["correctness"],
        "faithfulness": verdict["faithfulness"],
        "judge_reasoning": verdict["reasoning"],
        **citation_metrics(result.answer, len(result.evidence)),
        "steps": result.steps,
        "budget_exhausted": result.budget_exhausted,
        "latency_s": round(time.time() - start, 1),
        "trace": result.trace,
        "run_id": tracer.run_id,
        "error": error,
    }


def aggregate(rows: list[dict]) -> dict:
    scored = [r for r in rows if r.get("correctness") not in (None, "error") and not r.get("error")]
    def rate(key, value):
        return round(sum(1 for r in scored if r.get(key) == value) / len(scored), 3) if scored else 0.0
    faithful_applicable = [r for r in scored if r.get("faithfulness") not in ("na", "error", None)]
    return {
        "items": len(rows),
        "scored": len(scored),
        "errors": sum(1 for r in rows if r.get("error")),
        "correctness_pass": rate("correctness", "pass"),
        "correctness_partial": rate("correctness", "partial"),
        "faithfulness_pass": (
            round(sum(1 for r in faithful_applicable if r["faithfulness"] == "pass") / len(faithful_applicable), 3)
            if faithful_applicable else None
        ),
        "dangling_citation_items": sum(1 for r in scored if r.get("dangling_citations")),
        "avg_latency_s": round(sum(r["latency_s"] for r in rows) / len(rows), 1) if rows else 0,
        "avg_would_be_cost_usd": (
            round(sum(r.get("trace", {}).get("est_cost_usd", 0) for r in scored) / len(scored), 5)
            if scored else 0
        ),
    }


def git_sha() -> str:
    try:
        return subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, check=True
        ).stdout.strip()
    except Exception:  # noqa: BLE001
        return "unknown"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--category", default=None)
    ap.add_argument("--label", default="baseline")
    args = ap.parse_args()

    items = load_eval_set(args.category, args.limit)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    name = f"{stamp}-{args.label}-{git_sha()}"
    REPORTS_DIR.mkdir(exist_ok=True)

    print(f"eval: {len(items)} items | judge={JUDGE_MODEL} | report={name}")
    rows = []
    for i, item in enumerate(items, 1):
        print(f"  [{i}/{len(items)}] {item['id']} {item['question'][:60]}...", flush=True)
        row = evaluate_item(item)
        status = row.get("correctness", "ERROR") if not row.get("error") else "ERROR"
        print(f"      -> {status} | faith={row.get('faithfulness')} | {row['latency_s']}s", flush=True)
        rows.append(row)

    summary = aggregate(rows)
    detail_path = REPORTS_DIR / f"{name}.jsonl"
    with detail_path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    per_cat = {}
    for cat in sorted({r["category"] for r in rows}):
        per_cat[cat] = aggregate([r for r in rows if r["category"] == cat])

    md = [
        f"# Eval report: {name}",
        "",
        f"- git: `{git_sha()}` | judge: `{JUDGE_MODEL}` | items: {summary['items']} (errors: {summary['errors']})",
        f"- **correctness pass: {summary['correctness_pass']:.0%}** (partial: {summary['correctness_partial']:.0%})",
        f"- **faithfulness pass: {summary['faithfulness_pass']:.0%}**" if summary["faithfulness_pass"] is not None else "- faithfulness: n/a",
        f"- dangling-citation items: {summary['dangling_citation_items']}",
        f"- avg latency: {summary['avg_latency_s']}s | avg would-be cost: ${summary['avg_would_be_cost_usd']}",
        "",
        "| category | items | correct | faithful | avg latency |",
        "|---|---|---|---|---|",
    ]
    for cat, s in per_cat.items():
        faith = f"{s['faithfulness_pass']:.0%}" if s["faithfulness_pass"] is not None else "n/a"
        md.append(f"| {cat} | {s['scored']}/{s['items']} | {s['correctness_pass']:.0%} | {faith} | {s['avg_latency_s']}s |")
    (REPORTS_DIR / f"{name}.md").write_text("\n".join(md) + "\n", encoding="utf-8")

    print(f"\nsummary: {json.dumps(summary, indent=2)}")
    print(f"report: {detail_path} (+ .md)")


if __name__ == "__main__":
    main()
