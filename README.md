# AI Research Agent

**[Live demo](https://ai-research-agent-alpha-six.vercel.app)** · [API](https://ai-research-agent-e1je.onrender.com/config)

An agentic research assistant that plans its own searches, gathers evidence from the live web and from documents you upload, and answers with citations you can trace back to the exact passage the model read.

> The API sleeps when idle on its free tier and takes about a minute to wake on
> the first request. The UI polls through that and says so rather than showing
> an error.

The point of the project is not the demo — it is the **measurement**. Every architecture change is scored against a labelled evaluation set, every run writes a trace, and the UI is built so that a reviewer can inspect *why* an answer says what it says.

## Measured results

Latest full evaluation run — [`baseline-full` @ `4ec4dcf`](backend/app/eval/reports/20260726-2027-baseline-full-4ec4dcf.md), judged by `llama-3.1-8b` (a different model family from the agent's synthesizer, to limit self-preference bias):

| Metric | Result |
|---|---|
| Answer correctness | **100%** (29/29 scored) |
| Citation faithfulness | **100%** |
| Dangling citations | **0** |
| Avg latency | 57.5s |
| Avg would-be cost | $0.0023/query |

| Category | Items | Correct | Faithful | Avg latency |
|---|---|---|---|---|
| factual | 12/12 | 100% | 100% | 34.9s |
| multi_hop | 9/10 | 100% | 100% | 40.0s |
| adversarial | 8/8 | 100% | 100% | 113.2s |
| documents ([separate run](backend/app/eval/reports/20260726-2120-corpus-check-625ad49.md)) | 3/3 | 100% | 100% | 264.0s |

**How to read this honestly.** A 100% pass rate on a 30-question set is a *regression guard*, not proof of general correctness — it means the set's difficulty ceiling currently sits below the agent's ability. It is useful for catching a change that breaks something, and not much else. The set is being hardened with obscure multi-hop chains and recency-sensitive questions to create headroom. One item in the baseline errored on a transient DNS failure, which is counted as an error rather than quietly dropped — and that failure is what exposed a real bug (see below).

Every report is stamped with the commit it ran against, so any movement in these numbers is attributable to a specific change. Reports are committed under [`backend/app/eval/reports/`](backend/app/eval/reports/).

### What evaluation actually caught

- **Unwrapped network errors** — the DNS failure in the baseline run revealed that raw `httpx` errors in the search adapters crashed the whole item instead of rolling over to the next provider. Fixed with a regression test on run #1 of the harness.
- **Truncated document evidence** — retrieved chunks were being cut at 500 characters, so the agent found the right passage but the answer sat past the cut and it searched in circles until the step budget died. Fixing that plus evidence de-duplication took the same question from **247s → 37.5s**, 7 → 2 model calls, and budget-exhausted-incomplete → a clean correct answer.
- **Model latency collapse** — `llama-3.3-70b`'s tool-calling latency degraded from ~21s to ~184s under free-tier congestion. Re-probing the catalog and switching to `deepseek-v4-flash` was a one-line config change; a full run went from ~8 minutes to 93s.

These are recorded with evidence in [`docs/design-decisions.md`](docs/design-decisions.md).

## Architecture

```
question → planner (LLM decides which tools to call)
         → tool loop, budget-capped, retry/backoff
              ├── search_web    Tavily → Serper fallback chain
              └── search_corpus Gemini embeddings → Pinecone top-10 → rerank top-4
         → evidence store (deduped, source-attributed)
         → synthesis with inline [n] citations
         → JSONL trace (every call, token, latency, cost)

upload → extract (pypdf / text) → chunk → embed → upsert to Pinecone
```

- **Agent core** — a hand-rolled tool-use loop on OpenAI-compatible chat completions. No agent framework, so every part of the loop (tool-call validation, retry, budget enforcement, graceful degradation) is explicit and explainable.
- **Retrieval** — hybrid. Web search falls over between providers on quota or outage; document retrieval embeds with `gemini-embedding-001` (Matryoshka-truncated to 768 dims, content-hash cached so re-ingest is idempotent), queries Pinecone, then reranks with a hosted cross-encoder that degrades Pinecone → Cohere → no-rerank rather than failing the query.
- **Document upload** — PDFs and text files are extracted, chunked, embedded and indexed through the same pipeline as CLI ingest. Chunk ids are name-derived, so re-uploading a document *replaces* it; without deleting first, a shorter revision would strand orphan chunks from the previous version and silently poison retrieval. Scanned PDFs are rejected with an explanation rather than indexed as empty text.
- **Guardrails** — a hard step budget bounds the loop; a client-side rate limiter stays under the provider's cap; retries use exponential backoff; malformed tool calls are fed back to the model as errors rather than crashing the run.
- **Observability** — every run writes `traces/<run_id>.jsonl`, including its final answer and evidence. Run history in the UI is reconstructed entirely from those files; there is no database.

## Interface

A Next.js console with four sections, built on the rule that **nothing on screen is invented**:

- **Research** — depth and source controls that change real agent behaviour (step budget, tool allowlist), a live activity feed of actual SSE events (model calls, searches, provider retries with their backoff), and a report with citation links.
- **Library** — every past run, reconstructed from its trace: the answer, a forensic timeline stamped with offsets, sources, and metrics.
- **Evaluation** — the committed eval reports, with the caveat above stated in the UI.
- **Your documents** — drag-and-drop upload, per-document chunk counts, and delete.

Relevance is shown only where a provider actually returns one (Tavily's score, Pinecone's cosine similarity). Serper returns SERP rank, so its relevance column shows `—` rather than passing rank off as a score. Retrieved-but-uncited sources are labelled, not hidden.

Deliberately **not** built, for lack of a real data source: credibility scores, claim-verification matrices, and PDF/DOCX export. Export is Markdown and run JSON, both generated from the run.

## Stack

| Layer | Choice |
|---|---|
| LLM | NVIDIA NIM free endpoints (`deepseek-v4-flash`), OpenAI-compatible client |
| Web search | Tavily → Serper fallback chain |
| Embeddings | Google `gemini-embedding-001` (768-dim, cached) |
| Vector store | Pinecone serverless + hosted reranking |
| Backend | FastAPI, async, SSE streaming |
| Frontend | Next.js 16 (App Router), Tailwind, shadcn/ui, Motion |
| Evals | Custom harness — labelled set, LLM judge, deterministic citation checks |

The whole stack runs on free tiers, which is a real design constraint rather than a footnote: the ~40 req/min model cap is why the rate limiter exists, and the search quota is why the provider chain burns renewable quotas before finite credit pools.

## Running it

```bash
cp .env.example .env   # fill in your keys
```

Backend:

```bash
cd backend && python -m venv .venv && .venv/Scripts/activate && pip install -r requirements.txt && uvicorn app.main:app --port 8000
```

Frontend:

```bash
npm install --prefix web && npm run dev --prefix web
```

Documents can be uploaded from the **Your documents** page, or bulk-ingested from the CLI:

```bash
cd backend && python -m app.retrieval.ingest ../docs
```

Run the evaluation harness:

```bash
cd backend && python -m app.eval.run_eval --limit 8 --label my-experiment
```

Tests (54, no network — LLM, search and embedding calls are mocked):

```bash
cd backend && python -m pytest tests/ -q
```

## Deploying

The frontend goes to Vercel; the API does not. Two properties of the API
conflict with serverless functions: research runs stream for longer than the
Hobby duration cap allows, and run history is read back from trace files,
which a read-only per-invocation filesystem cannot serve. So the API runs on
Render's native Python runtime instead — [`render.yaml`](render.yaml) is a
blueprint, no Docker involved.

**API (Render)** — New → **Blueprint** (not "Web Service"), point at this repo.
A Blueprint applies `render.yaml`; a manually created service ignores it and
builds from the repo root, which fails because `requirements.txt` lives in
`backend/`. Then set the secrets listed in `render.yaml` (`sync: false` means
"set it in the dashboard"), plus `ALLOWED_ORIGINS` set to the Vercel URL once
the frontend exists.

If you did create the service by hand, set these to match the blueprint:
Root Directory `backend`, build `pip install -r requirements.txt`, start
`uvicorn app.main:app --host 0.0.0.0 --port $PORT`, health check `/health`,
and `DATA_DIR` to a writable path. The Python version is pinned by
`backend/.python-version` either way.

**Frontend (Vercel)** — import the repo, set the root directory to `web`, and
set `NEXT_PUBLIC_API_BASE` to the Render URL. [`web/vercel.json`](web/vercel.json)
covers the rest.

Both are pinned to regions near the expected audience — Vercel `bom1`, Render
`singapore`. Pages are server-rendered per request (the root layout reads a
theme cookie), so the Vercel region sets HTML latency, while every data call
goes from the browser straight to Render, so that region sets API latency.
Neither service calls the other server-side, which is why they can sit in
different regions without a penalty.

Two free-tier behaviours are worth knowing rather than being surprised by:

- **The API sleeps when idle** and takes about a minute to wake. The UI polls
  through this and says so, rather than reporting the backend as down.
- **Storage is ephemeral.** Traces and the embedding cache live on the
  instance's disk, so run history is "runs this instance has served", not a
  permanent archive. A persistent disk is a paid feature; moving traces to
  object storage or Postgres is the fix if that matters.
