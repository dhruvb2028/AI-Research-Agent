"""Tests for eval metrics, judge parsing, and set loading — no network."""
from app.eval.judge import _parse_verdict
from app.eval.metrics import citation_metrics
from app.eval.run_eval import aggregate, load_eval_set


def test_citation_metrics_valid():
    m = citation_metrics("Fact one [1]. Fact two [2][3].", evidence_count=3)
    assert m["cited_count"] == 3
    assert m["dangling_citations"] == []
    assert m["citations_structurally_valid"]
    assert m["citation_coverage"] == 1.0


def test_citation_metrics_dangling():
    m = citation_metrics("Claim [1] and phantom [7].", evidence_count=2)
    assert m["dangling_citations"] == [7]
    assert not m["citations_structurally_valid"]


def test_citation_metrics_uncited():
    m = citation_metrics("No citations at all.", evidence_count=4)
    assert not m["has_citations"]
    assert m["citation_coverage"] == 0.0


def test_judge_parse_clean_and_wrapped():
    assert _parse_verdict('{"correctness": "pass", "faithfulness": "na", "reasoning": "ok"}')["correctness"] == "pass"
    wrapped = 'Here is my grade:\n{"correctness": "partial", "faithfulness": "pass", "reasoning": "x"}\nDone.'
    assert _parse_verdict(wrapped)["correctness"] == "partial"


def test_judge_parse_garbage_degrades_to_error():
    v = _parse_verdict("I think it's fine!")
    assert v["correctness"] == "error"
    v2 = _parse_verdict('{"correctness": "amazing"}')
    assert v2["correctness"] == "error"


def test_load_eval_set_spreads_limit_across_categories():
    items = load_eval_set(limit=6)
    cats = {i["category"] for i in items}
    assert len(items) == 6
    assert cats == {"factual", "multi_hop", "adversarial"}


def test_aggregate_rates():
    rows = [
        {"id": "1", "category": "factual", "correctness": "pass", "faithfulness": "pass", "latency_s": 10, "trace": {"est_cost_usd": 0.01}},
        {"id": "2", "category": "factual", "correctness": "fail", "faithfulness": "na", "latency_s": 20, "trace": {"est_cost_usd": 0.01}},
        {"id": "3", "category": "factual", "error": "boom", "latency_s": 5},
    ]
    s = aggregate(rows)
    assert s["scored"] == 2
    assert s["errors"] == 1
    assert s["correctness_pass"] == 0.5
    assert s["faithfulness_pass"] == 1.0  # only item 1 is applicable
