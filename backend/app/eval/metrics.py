"""Deterministic, non-LLM metrics computed on every eval item.

These catch structural failures cheaply (dangling citations, uncited answers)
before any judge model gets involved.
"""
from __future__ import annotations

import re

CITATION_RE = re.compile(r"\[(\d+)\]")


def citation_metrics(answer: str, evidence_count: int) -> dict:
    cited = {int(n) for n in CITATION_RE.findall(answer)}
    valid = {n for n in cited if 1 <= n <= evidence_count}
    dangling = cited - valid
    return {
        "evidence_count": evidence_count,
        "cited_count": len(cited),
        "dangling_citations": sorted(dangling),
        "has_citations": bool(cited),
        # Structurally sound = cites something and never cites evidence that doesn't exist.
        # (For adversarial items with no evidence, an uncited answer is fine — the
        # runner treats has_citations as informational there, not a failure.)
        "citations_structurally_valid": bool(cited) and not dangling,
        "citation_coverage": round(len(valid) / evidence_count, 3) if evidence_count else 0.0,
    }
