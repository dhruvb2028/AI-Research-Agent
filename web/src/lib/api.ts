// Client for the research-agent backend.
//
// Every type here mirrors something the backend actually produces — agent SSE
// events, JSONL traces, committed eval reports, live Pinecone stats. There is
// no mock layer: if a field isn't here, the system doesn't measure it.

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export type Depth = "quick" | "standard" | "deep";
export type ToolName = "search_web" | "search_corpus";

export interface Evidence {
  url: string;
  title: string;
  snippet: string;
  /** Provider that served it: "tavily" | "serper" | "corpus/<reranker>". */
  source: string;
  query?: string;
  /** Relevance, only where the provider returns one (Tavily, Pinecone). */
  score?: number | null;
  /** SERP position, Serper only. */
  rank?: number | null;
}

export interface TraceSummary {
  llm_calls?: number;
  llm_seconds?: number;
  tool_calls?: number;
  tool_seconds?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  est_cost_usd?: number;
}

export interface DonePayload {
  run_id: string;
  answer: string;
  evidence: Evidence[];
  steps: number;
  budget_exhausted: boolean;
  trace: TraceSummary;
}

export type AgentEvent =
  | { type: "run_id"; data: { run_id: string } }
  | {
      type: "start";
      data: { question: string; model: string; max_steps: number; tools: string[] };
    }
  | { type: "step"; data: { step: number; max_steps: number } }
  | {
      type: "llm";
      data: {
        model: string;
        latency_s: number;
        prompt_tokens: number;
        completion_tokens: number;
      };
    }
  | {
      type: "retry";
      data: { attempt: number; max_attempts: number; delay_s: number; error: string };
    }
  | {
      type: "tool";
      data: { step: number; tool: string; arguments: string; new_evidence: Evidence[] };
    }
  | { type: "done"; data: DonePayload }
  | { type: "error"; data: { message: string } };

export interface RunSummary {
  run_id: string;
  question: string;
  model: string;
  started_at: number;
  duration_s: number;
  completed: boolean;
  budget_exhausted: boolean;
  steps: number | null;
  tool_calls: number;
  retries: number;
  est_cost_usd: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
}

/** One recorded activity event from a past run's trace file. */
export interface TimelineEvent {
  type: "llm_call" | "tool_call" | "tool_error" | "llm_retry";
  offset_s: number;
  model?: string;
  latency_s?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  est_cost_usd?: number;
  tool?: string;
  query?: string;
  results?: number;
  provider?: string | null;
  error?: string;
  attempt?: number;
  delay_s?: number;
}

export interface RunDetail extends RunSummary {
  max_steps: number | null;
  /** null for runs recorded before results were persisted. */
  answer: string | null;
  evidence: Evidence[];
  trace: TraceSummary;
  timeline: TimelineEvent[];
}

export interface EvalReport {
  id: string;
  date: string;
  label: string;
  git_sha: string;
  items: number;
  scored: number;
  errors: number;
  correctness_pass: number | null;
  faithfulness_pass: number | null;
  dangling_citation_items: number;
  avg_latency_s: number | null;
  categories: string[];
}

export interface CorpusStats {
  available: boolean;
  index: string;
  vectors?: number;
  dimension?: number;
  namespaces?: Record<string, { vectors: number }>;
  /** Indexed documents, derived from chunk ids. */
  documents?: { doc: string; chunks: number }[];
  error?: string;
}

export interface AgentConfig {
  model: string;
  depth_budgets: Record<Depth, number>;
  retrieval: { top_k: number; top_n: number; index: string };
  search_chain: string[];
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json();
}

export const getConfig = () => getJSON<AgentConfig>("/config");
export const getRuns = () => getJSON<RunSummary[]>("/runs");
export const getRun = (id: string) => getJSON<RunDetail>(`/runs/${id}`);
export const getEvals = () => getJSON<EvalReport[]>("/evals");
export const getCorpus = () => getJSON<CorpusStats>("/corpus");

export async function uploadDocument(
  file: File,
): Promise<{ doc: string; chunks: number; characters: number }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/corpus/documents`, { method: "POST", body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail ?? `upload failed (${res.status})`);
  return body;
}

export async function deleteDocument(doc: string): Promise<void> {
  const res = await fetch(`${API_BASE}/corpus/documents/${encodeURIComponent(doc)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `delete failed (${res.status})`);
  }
}

/**
 * Streams a research run. EventSource is GET-only, so we read the POST body
 * stream and parse SSE blocks ourselves.
 */
export async function streamResearch(
  body: { question: string; depth: Depth; tools: ToolName[] },
  onEvent: (e: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const resp = await fetch(`${API_BASE}/research`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok || !resp.body) throw new Error(`backend returned ${resp.status}`);

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let type = "";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) type = line.slice(7).trim();
        else if (line.startsWith("data: ")) data = line.slice(6);
      }
      if (type && data) onEvent({ type, data: JSON.parse(data) } as AgentEvent);
    }
  }
}

/** Which [n] markers the answer actually cites. */
export function citedIndices(answer: string): Set<number> {
  return new Set(Array.from(answer.matchAll(/\[(\d+)\]/g), (m) => Number(m[1])));
}


export function isCorpus(e: Evidence): boolean {
  return e.url.startsWith("corpus://");
}

export function hostOf(url: string): string {
  if (url.startsWith("corpus://")) return url.slice("corpus://".length);
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
