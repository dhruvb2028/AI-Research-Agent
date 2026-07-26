"""FastAPI entry point: SSE-streamed research runs, run history, corpus and eval stats.

Every endpoint returns data the system actually produced — traces the agent
wrote, reports the eval harness measured, stats the vector index reports.
Nothing here is synthesized for presentation.

POST /research streams Server-Sent Events while the agent works:
  event: start | step | llm | retry | tool | done | error
The agent runs in a worker thread; events cross to the async response through
a queue so the stream stays live during long LLM calls.
"""
from __future__ import annotations

import json
import queue
import threading
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app import evals, runs
from app.agent.orchestrator import DEPTH_BUDGETS, run_agent
from app.config import LARGE_MODEL, PINECONE_INDEX, RERANK_TOP_N, RETRIEVE_TOP_K
from app.tracing.trace_logger import Tracer

app = FastAPI(title="Research Agent")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # demo deployment; lock to the frontend origin in production
    allow_methods=["*"],
    allow_headers=["*"],
)


class ResearchRequest(BaseModel):
    question: str = Field(min_length=3, max_length=2000)
    depth: Literal["quick", "standard", "deep"] = "standard"
    # Which retrieval tools the agent may use. Both by default.
    tools: list[Literal["search_web", "search_corpus"]] = ["search_web", "search_corpus"]


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/config")
def config() -> dict:
    """What this deployment is actually running — shown in the UI, not hardcoded there."""
    return {
        "model": LARGE_MODEL,
        "depth_budgets": DEPTH_BUDGETS,
        "retrieval": {"top_k": RETRIEVE_TOP_K, "top_n": RERANK_TOP_N, "index": PINECONE_INDEX},
        "search_chain": ["tavily", "serper"],
    }


@app.get("/runs")
def list_runs(limit: int = 50) -> list[dict]:
    return runs.list_runs(limit=limit)


@app.get("/runs/{run_id}")
def get_run(run_id: str) -> dict:
    run = runs.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="run not found")
    return run


@app.get("/evals")
def list_evals() -> list[dict]:
    return evals.list_reports()


@app.get("/evals/{report_id}")
def get_eval(report_id: str) -> dict:
    report = evals.get_report(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="report not found")
    return report


@app.get("/corpus")
def corpus_stats() -> dict:
    """Live Pinecone index stats — what is actually ingested right now."""
    try:
        from app.retrieval.pinecone_store import PineconeStore

        store = PineconeStore()
        stats = store.describe()
        return {"available": True, "index": PINECONE_INDEX, **stats}
    except Exception as e:  # noqa: BLE001 — corpus is optional; report why it's unavailable
        return {"available": False, "index": PINECONE_INDEX, "error": f"{type(e).__name__}: {e}"}


@app.post("/research")
def research(req: ResearchRequest) -> StreamingResponse:
    q: queue.Queue = queue.Queue()

    def emit(type_: str, payload: dict) -> None:
        q.put((type_, payload))

    def work() -> None:
        tracer = Tracer()
        try:
            emit("run_id", {"run_id": tracer.run_id})
            result = run_agent(
                req.question,
                tracer=tracer,
                on_event=emit,
                max_steps=DEPTH_BUDGETS[req.depth],
                enabled_tools=req.tools,
            )
            emit(
                "done",
                {
                    "run_id": tracer.run_id,
                    "answer": result.answer,
                    "evidence": result.evidence,
                    "steps": result.steps,
                    "budget_exhausted": result.budget_exhausted,
                    "trace": result.trace,
                },
            )
        except Exception as e:  # noqa: BLE001 — stream the failure, don't drop the connection
            emit("error", {"message": f"{type(e).__name__}: {e}"})
        finally:
            q.put(None)

    threading.Thread(target=work, daemon=True).start()

    def stream():
        while True:
            item = q.get()
            if item is None:
                break
            type_, payload = item
            yield f"event: {type_}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
