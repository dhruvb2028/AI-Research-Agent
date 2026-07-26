// POST-based SSE consumption. EventSource only supports GET, so we read the
// fetch body stream and parse event/data blocks ourselves.

export interface Evidence {
  url: string;
  title: string;
  snippet: string;
  source: string;
  query?: string;
}

export interface ToolEvent {
  step: number;
  tool: string;
  arguments: string;
  new_evidence: Evidence[];
}

export interface DoneEvent {
  answer: string;
  evidence: Evidence[];
  steps: number;
  budget_exhausted: boolean;
  trace: {
    llm_calls?: number;
    llm_seconds?: number;
    tool_calls?: number;
    tool_seconds?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    est_cost_usd?: number;
  };
}

export type AgentEvent =
  | { type: "start"; data: { question: string; model: string } }
  | { type: "tool"; data: ToolEvent }
  | { type: "done"; data: DoneEvent }
  | { type: "error"; data: { message: string } };

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export async function streamResearch(
  question: string,
  onEvent: (e: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const resp = await fetch(`${API_BASE}/research`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
    signal,
  });
  if (!resp.ok || !resp.body) {
    throw new Error(`backend returned ${resp.status}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let type = "";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) type = line.slice(7).trim();
        else if (line.startsWith("data: ")) data = line.slice(6);
      }
      if (type && data) {
        onEvent({ type, data: JSON.parse(data) } as AgentEvent);
      }
    }
  }
}
