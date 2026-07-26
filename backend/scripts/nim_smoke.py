"""Smoke test for the NVIDIA NIM endpoint.

Verifies the API key, checks which candidate models are live in the catalog,
probes tool-calling reliability on each, and surfaces any rate-limit/quota
headers so we know what the free tier actually enforces.

Run from backend/:  python scripts/nim_smoke.py
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from openai import OpenAI

from app.config import NIM_API_KEY, NIM_BASE_URL

LARGE_CANDIDATES = [
    "meta/llama-3.3-70b-instruct",
    "deepseek-ai/deepseek-r1-distill-llama-70b",
    "qwen/qwen2.5-72b-instruct",
    "mistralai/mistral-large-2-instruct",
]
SMALL_CANDIDATES = [
    "meta/llama-3.1-8b-instruct",
    "qwen/qwen2.5-7b-instruct",
    "mistralai/mistral-7b-instruct-v0.3",
]

SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "search_web",
        "description": "Search the web for current information.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The search query"},
            },
            "required": ["query"],
        },
    },
}

TOOL_PROMPT = "What is the current population of Bangalore? Use the search tool."
TRIALS_PER_MODEL = 3


def probe_tool_calling(client: OpenAI, model: str) -> dict:
    """Run a few tool-call trials; count how many produce a valid search_web call."""
    ok, errors = 0, []
    latencies = []
    for _ in range(TRIALS_PER_MODEL):
        start = time.time()
        try:
            resp = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": TOOL_PROMPT}],
                tools=[SEARCH_TOOL],
                temperature=0.2,
                max_tokens=300,
            )
            latencies.append(time.time() - start)
            calls = resp.choices[0].message.tool_calls or []
            if calls and calls[0].function.name == "search_web":
                args = json.loads(calls[0].function.arguments)
                if isinstance(args.get("query"), str) and args["query"].strip():
                    ok += 1
                else:
                    errors.append("tool call missing/empty query arg")
            else:
                errors.append("no tool call emitted")
        except Exception as e:  # noqa: BLE001 — smoke test reports everything
            latencies.append(time.time() - start)
            errors.append(f"{type(e).__name__}: {e}")
        time.sleep(2)  # stay well under the free-tier rate limit
    return {
        "tool_call_success": f"{ok}/{TRIALS_PER_MODEL}",
        "avg_latency_s": round(sum(latencies) / len(latencies), 2) if latencies else None,
        "errors": errors[:2],
    }


def main() -> None:
    if not NIM_API_KEY:
        sys.exit("Nvidia_API_KEY missing from .env")

    client = OpenAI(base_url=NIM_BASE_URL, api_key=NIM_API_KEY)

    print("== Catalog check ==")
    live = {m.id for m in client.models.list()}
    print(f"models visible in catalog: {len(live)}")

    raw = client.chat.completions.with_raw_response.create(
        model=next(m for m in LARGE_CANDIDATES if m in live),
        messages=[{"role": "user", "content": "Reply with the single word: ok"}],
        max_tokens=5,
    )
    quota_headers = {
        k: v for k, v in raw.headers.items()
        if any(t in k.lower() for t in ("ratelimit", "quota", "credit", "remaining"))
    }
    print(f"quota/rate-limit headers: {quota_headers or 'none exposed'}")

    print("\n== Tool-calling probe ==")
    results = {}
    for tier, candidates in (("large", LARGE_CANDIDATES), ("small", SMALL_CANDIDATES)):
        for model in candidates:
            if model not in live:
                print(f"  [skip] {model} (not in catalog)")
                continue
            print(f"  [{tier}] {model} ...", flush=True)
            results[model] = {"tier": tier, **probe_tool_calling(client, model)}
            print(f"      -> {results[model]}")

    out = Path(__file__).with_name("nim_smoke_results.json")
    out.write_text(json.dumps(results, indent=2))
    print(f"\nresults written to {out}")


if __name__ == "__main__":
    main()
