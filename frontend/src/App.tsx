import { useCallback, useRef, useState } from "react";
import { AnswerCard } from "./components/AnswerCard";
import { ProgressFeed } from "./components/ProgressFeed";
import { SourcesPanel } from "./components/SourcesPanel";
import { StatsBar } from "./components/StatsBar";
import { type DoneEvent, type ToolEvent, streamResearch } from "./lib/sse";

const EXAMPLES = [
  "What did NVIDIA announce at GTC 2026?",
  "Why was Brave dropped from this project's search chain?",
  "Which is taller: the Eiffel Tower or the UN headquarters?",
];

type Phase = "idle" | "running" | "done" | "error";

export default function App() {
  const [question, setQuestion] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const [result, setResult] = useState<DoneEvent | null>(null);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (q: string) => {
    if (!q.trim()) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPhase("running");
    setToolEvents([]);
    setResult(null);
    setError("");
    try {
      await streamResearch(
        q,
        (e) => {
          if (e.type === "tool") setToolEvents((prev) => [...prev, e.data]);
          else if (e.type === "done") {
            setResult(e.data);
            setPhase("done");
          } else if (e.type === "error") {
            setError(e.data.message);
            setPhase("error");
          }
        },
        ctrl.signal,
      );
    } catch (err) {
      if (!ctrl.signal.aborted) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    }
  }, []);

  return (
    <div className="app">
      <header className="header">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
          <path d="M11 8a3 3 0 0 0-3 3" />
        </svg>
        <h1>Research Agent</h1>
        <span className="badge">web + private corpus</span>
      </header>

      <form
        className="ask"
        onSubmit={(e) => {
          e.preventDefault();
          run(question);
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a research question…"
          aria-label="Research question"
          maxLength={2000}
        />
        <button type="submit" disabled={phase === "running" || !question.trim()}>
          {phase === "running" ? (
            <>
              <span className="spinner" aria-hidden="true" /> Working
            </>
          ) : (
            "Research"
          )}
        </button>
      </form>

      {phase === "idle" && (
        <div className="examples" role="list" aria-label="Example questions">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setQuestion(ex);
                run(ex);
              }}
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      <ProgressFeed events={toolEvents} running={phase === "running"} />

      {phase === "error" && (
        <div className="error" role="alert">
          Run failed: {error}
        </div>
      )}

      {result && (
        <>
          <AnswerCard answer={result.answer} budgetExhausted={result.budget_exhausted} />
          <SourcesPanel evidence={result.evidence} />
          <StatsBar trace={result.trace} steps={result.steps} />
        </>
      )}
    </div>
  );
}
