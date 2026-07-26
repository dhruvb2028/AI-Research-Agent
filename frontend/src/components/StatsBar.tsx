import type { DoneEvent } from "../lib/sse";

export function StatsBar({ trace, steps }: { trace: DoneEvent["trace"]; steps: number }) {
  const items: [string, string][] = [
    ["steps", String(steps)],
    ["llm", `${trace.llm_calls ?? 0} calls · ${(trace.llm_seconds ?? 0).toFixed(1)}s`],
    ["tools", `${trace.tool_calls ?? 0} calls · ${(trace.tool_seconds ?? 0).toFixed(1)}s`],
    ["tokens", `${trace.prompt_tokens ?? 0} in / ${trace.completion_tokens ?? 0} out`],
    ["cost*", `$${(trace.est_cost_usd ?? 0).toFixed(4)}`],
  ];
  return (
    <div className="stats" title="*would-be cost at paid-host rates; actual stack cost is $0">
      {items.map(([k, v]) => (
        <span key={k}>
          {k} <strong>{v}</strong>
        </span>
      ))}
    </div>
  );
}
