# AI Research Agent

An agentic research assistant: give it a question and it plans sub-questions, searches the web and a document corpus, cross-checks claims across sources, and returns a cited, synthesized answer — with a real evaluation harness measuring answer quality, citation faithfulness, latency, and cost across every design iteration.

> Work in progress. Eval numbers, demo link, and architecture docs land as the build progresses.

## Stack

- **Agent core**: hand-rolled tool-use loop (no framework) on OpenAI-compatible chat completions — NVIDIA NIM hosted open-weight models, two-tier routing (large model for planning/synthesis, small for cheap sub-tasks)
- **Retrieval**: hybrid — web search (Tavily → Brave → Firecrawl fallback chain) + Pinecone vector store with Gemini embeddings and hosted reranking
- **API**: FastAPI (async, SSE streaming) · **UI**: React + Vite
- **Evals**: custom harness — labeled question set, LLM-judge + citation-overlap scoring, versioned reports
- **Observability**: JSONL traces of every tool call, token count, and cost

## Setup

```bash
cp .env.example .env   # fill in your keys
cd backend
python -m venv .venv
.venv/Scripts/activate  # Windows; use .venv/bin/activate on Unix
pip install -r requirements.txt
python scripts/nim_smoke.py  # verify your NIM key + pick model IDs
```
