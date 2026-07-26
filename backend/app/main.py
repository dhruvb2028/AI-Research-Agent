"""FastAPI entry point: SSE-streamed research runs + health check.

POST /research streams Server-Sent Events while the agent works:
  event: start | tool | done | error
The agent runs in a worker thread; events cross to the async response through
a queue so the stream stays live during long LLM calls.
"""
from __future__ import annotations

import json
import queue
import threading

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.agent.orchestrator import run_agent
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


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/research")
def research(req: ResearchRequest) -> StreamingResponse:
    agent_fn = run_agent
    q: queue.Queue = queue.Queue()

    def emit(type_: str, payload: dict) -> None:
        q.put((type_, payload))

    def work() -> None:
        try:
            result = agent_fn(req.question, tracer=Tracer(), on_event=emit)
            emit(
                "done",
                {
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
