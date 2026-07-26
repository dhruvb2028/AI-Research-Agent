"""LLM-judge for answer correctness and citation faithfulness.

The judge is deliberately a DIFFERENT model family (llama) than the agent's
synthesizer (deepseek) to reduce self-preference bias. llama-3.1-8b over the
70b: rubric-based grading with a strict output schema is a much easier task
than open synthesis, and the 8b answers in ~1.5s where the congested 70b took
3+ minutes per verdict. The quality tradeoff is real — mitigated by explicit
per-item rubrics and periodic hand-checked calibration of judge verdicts, not
by trusting the judge blindly.
"""
from __future__ import annotations

import json
import os

from app.llm import LLMClient

JUDGE_MODEL = os.getenv("JUDGE_MODEL", "meta/llama-3.1-8b-instruct")

JUDGE_PROMPT = """You are grading a research agent's answer. Be strict but fair.

QUESTION:
{question}

GRADING RUBRIC (what a correct answer must contain):
{rubric}

EVIDENCE the agent retrieved (numbered snippets it can cite as [n]):
{evidence}

AGENT'S ANSWER:
{answer}

Grade two things:
1. correctness — does the answer satisfy the rubric? "pass" (satisfies it),
   "partial" (right direction, missing/wrong detail), or "fail".
2. faithfulness — for claims with citations [n], does the cited evidence
   actually support the claim? "pass", "partial", "fail", or "na" if there are
   no citations or no evidence.

Reply with ONLY a JSON object:
{{"correctness": "pass|partial|fail", "faithfulness": "pass|partial|fail|na", "reasoning": "<one or two sentences>"}}"""


def judge_answer(
    question: str,
    rubric: str,
    answer: str,
    evidence: list[dict],
    llm: LLMClient | None = None,
    model: str = JUDGE_MODEL,
) -> dict:
    llm = llm or LLMClient()
    evidence_text = "\n".join(
        f"[{i}] {e.get('title', '')} — {e.get('snippet', '')[:300]}"
        for i, e in enumerate(evidence, 1)
    ) or "(none)"

    msg = llm.chat(
        model=model,
        messages=[
            {
                "role": "user",
                "content": JUDGE_PROMPT.format(
                    question=question, rubric=rubric, evidence=evidence_text, answer=answer
                ),
            }
        ],
        temperature=0.0,
        max_tokens=300,
    )
    return _parse_verdict(msg.content or "")


def _parse_verdict(raw: str) -> dict:
    """Extract the JSON verdict; malformed judge output degrades to 'error', never crashes."""
    try:
        start, end = raw.index("{"), raw.rindex("}") + 1
        verdict = json.loads(raw[start:end])
        if verdict.get("correctness") not in ("pass", "partial", "fail"):
            raise ValueError(f"bad correctness value: {verdict.get('correctness')}")
        if verdict.get("faithfulness") not in ("pass", "partial", "fail", "na"):
            verdict["faithfulness"] = "na"
        return verdict
    except (ValueError, json.JSONDecodeError) as e:
        return {"correctness": "error", "faithfulness": "error", "reasoning": f"unparseable judge output: {e}"}
