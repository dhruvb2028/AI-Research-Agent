# Design Decisions

Each entry: the decision, alternatives considered, why, and what would change it.
Written as decisions happen — this is the source of truth for "why did you do X?"

## 001 — LLM provider: NVIDIA NIM free endpoints (2026-07-26)

**Decision**: All LLM calls go through NVIDIA NIM's OpenAI-compatible endpoint
(`integrate.api.nvidia.com/v1`) using the standard `openai` Python client.

**Alternatives**: OpenAI/Anthropic paid APIs (better tool-calling, costs real money
across dozens of eval iterations); Groq free tier (tight daily token caps, smaller
catalog); Google AI Studio (generous, kept as configured fallback — same key also
serves embeddings).

**Why**: $0 sustained development cost; 118-model catalog on one key; the
OpenAI-compatible interface makes any future provider switch a config change.

**Would change it**: production deployment, or eval showing open-weight quality is
the binding constraint on answer quality.

## 002 — Model routing: llama-3.3-70b (large) + llama-3.1-8b (small) (2026-07-26)

**Decision**: Two-tier routing. `meta/llama-3.3-70b-instruct` for planning and
synthesis; `meta/llama-3.1-8b-instruct` for cheap sub-tasks (classification,
contradiction checks, query decomposition).

**Evidence** (`scripts/nim_smoke.py`, 3 trials each, live endpoint):
- llama-3.3-70b: 3/3 valid `search_web` tool calls, avg latency **20.9s**
- llama-3.1-8b: 3/3 valid tool calls, avg latency **0.87s**
- mistral-large-2 & mistral-7b: listed in catalog but 404 for this account
- qwen2.5 / deepseek-r1-distill candidate IDs not in catalog

**Known concern**: the 70B's ~21s latency (likely free-tier queueing) directly
inflates per-query latency (2+ large calls per question). Catalog-live alternatives
to probe if it persists: `deepseek-ai/deepseek-v4-flash`, `moonshotai/kimi-k2.6`,
`nvidia/llama-3.3-nemotron-super-49b-v1.5`.

**Also learned**: NIM exposes no rate-limit/quota/credit headers, so credit burn
is not observable via the API — budget eval passes conservatively (small routine
subset, rare full runs).

## 003 — Brave cut from the search fallback chain (2026-07-26)

**Decision**: The web-search fallback chain is Tavily (1,000 credits/mo, renewable)
→ Firecrawl (~100k one-time credit pool). Brave Search API — originally planned as
the middle tier — is out.

**How we found out**: the first live end-to-end run of the agent was a question
about search-API free tiers. Its own cited answer surfaced that Brave discontinued
its free tier in early 2026: new users get $5/month in metered credits (~1,000
queries) and the card collected at signup becomes an active billing instrument
with **no spending cap**. Verified against multiple independent sources. That
uncapped-billing shape violates this project's hard $0 constraint.

**Why the ordering**: the renewable quota burns first, the finite pool last —
spend income before savings. When the whole chain is exhausted, the agent answers
from the local corpus only and flags reduced coverage rather than failing.

**Lesson recorded**: free tiers drift. Provider assumptions get re-verified at
integration time, not trusted from planning docs — and because every provider sits
behind a thin adapter, losing Brave changed configuration, not architecture.

**Would change it**: Brave restoring a card-free tier, or a budget making its
$5/mo the cheapest way to lift the search ceiling (it likely is, if money enters).

## 004 — Large model switched to deepseek-v4-flash after latency collapse (2026-07-27)

**Decision**: `LARGE_MODEL` default moves from `meta/llama-3.3-70b-instruct` to
`deepseek-ai/deepseek-v4-flash`.

**Evidence**: a full agent run took ~8 minutes wall-clock; the re-probe
(`scripts/nim_smoke.py`) showed why — the 70B's average latency had collapsed
from 20.9s (at pin time) to **184s** under free-tier congestion, still 3/3 on
tool calls but unusable interactively. Alternatives probed the same session:
- `deepseek-v4-flash`: valid tool calls whenever actually served (~14.5s avg);
  its one failure was a 503 worker-limit — retryable infrastructure noise that
  the client's backoff now absorbs, not a model defect.
- `nvidia/llama-3.3-nemotron-super-49b-v1.5`: fast (8.8s) but 0/3 tool calls
  emitted — disqualified outright.
- `moonshotai/kimi-k2.6`: 404 for this account despite being catalog-listed.

**Lesson**: free-tier latency is not a constant — it degrades an order of
magnitude with load, so model choice needs re-validation, not a one-time pin.
The config-only switch (one env var) is the portability argument made concrete.

**Would change it**: deepseek 503s becoming chronic rather than transient
(fallback: re-probe catalog; the 70B remains the reliability baseline), or a
paid tier removing the queue entirely.

## 005 — Smoke-test artifacts stay untracked (2026-07-26)

`scripts/nim_smoke_results.json` is gitignored: error payloads embed the NIM
account identifier, and results are point-in-time measurements, not source.
Durable findings get recorded here instead.
