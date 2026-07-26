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

## 003 — Smoke-test artifacts stay untracked (2026-07-26)

`scripts/nim_smoke_results.json` is gitignored: error payloads embed the NIM
account identifier, and results are point-in-time measurements, not source.
Durable findings get recorded here instead.
