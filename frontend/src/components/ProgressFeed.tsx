import type { ToolEvent } from "../lib/sse";

const GlobeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
    <path d="M2 12h20" />
  </svg>
);

const FolderIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  </svg>
);

function parseQuery(args: string): string {
  try {
    return JSON.parse(args).query ?? args;
  } catch {
    return args;
  }
}

export function ProgressFeed({ events, running }: { events: ToolEvent[]; running: boolean }) {
  if (!running && events.length === 0) return null;
  return (
    <div className="feed" aria-live="polite">
      {events.map((e, i) => (
        <div className="feed-item" key={i}>
          {e.tool === "search_corpus" ? <FolderIcon /> : <GlobeIcon />}
          <div>
            <div className="query">{parseQuery(e.arguments)}</div>
            <div className="meta">
              {e.tool === "search_corpus" ? "private corpus" : "web search"} · step {e.step} ·{" "}
              {e.new_evidence.length} new source{e.new_evidence.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      ))}
      {running && (
        <div className="thinking">
          <span className="spinner" aria-hidden="true" />
          {events.length === 0 ? "Planning research…" : "Reading evidence and reasoning…"}
        </div>
      )}
    </div>
  );
}
