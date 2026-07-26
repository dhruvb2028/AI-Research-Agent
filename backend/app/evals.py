"""Serve the committed eval reports.

These are the real measured quality numbers for the agent — read straight from
the versioned report files, never recomputed or rounded for presentation.
"""
from __future__ import annotations

import json
from pathlib import Path

REPORTS_DIR = Path(__file__).parent / "eval" / "reports"


def _parse_name(stem: str) -> dict:
    # "20260726-2027-baseline-full-4ec4dcf" -> date, label, git sha
    parts = stem.split("-")
    return {
        "id": stem,
        "date": f"{parts[0]}-{parts[1]}" if len(parts) > 1 else stem,
        "label": "-".join(parts[2:-1]) if len(parts) > 3 else stem,
        "git_sha": parts[-1] if len(parts) > 3 else "",
    }


def list_reports() -> list[dict]:
    if not REPORTS_DIR.exists():
        return []
    out = []
    for f in sorted(REPORTS_DIR.glob("*.jsonl"), reverse=True):
        rows = [json.loads(l) for l in f.read_text(encoding="utf-8").splitlines() if l.strip()]
        scored = [r for r in rows if r.get("correctness") not in (None, "error") and not r.get("error")]
        faith = [r for r in scored if r.get("faithfulness") not in ("na", "error", None)]
        out.append(
            {
                **_parse_name(f.stem),
                "items": len(rows),
                "scored": len(scored),
                "errors": sum(1 for r in rows if r.get("error")),
                "correctness_pass": (
                    round(sum(1 for r in scored if r["correctness"] == "pass") / len(scored), 3)
                    if scored else None
                ),
                "faithfulness_pass": (
                    round(sum(1 for r in faith if r["faithfulness"] == "pass") / len(faith), 3)
                    if faith else None
                ),
                "dangling_citation_items": sum(1 for r in scored if r.get("dangling_citations")),
                "avg_latency_s": (
                    round(sum(r["latency_s"] for r in rows) / len(rows), 1) if rows else None
                ),
                "categories": sorted({r["category"] for r in rows if r.get("category")}),
            }
        )
    return out


def get_report(report_id: str) -> dict | None:
    path = REPORTS_DIR / f"{report_id}.jsonl"
    if not path.exists():
        return None
    rows = [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]
    return {**_parse_name(report_id), "items": rows}
