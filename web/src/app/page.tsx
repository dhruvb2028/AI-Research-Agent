"use client";

import { AlertCircle, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ReportView } from "@/components/research/report-view";
import { ResearchForm } from "@/components/research/research-form";
import { RunStats } from "@/components/research/run-stats";
import { SourcePreview } from "@/components/research/source-preview";
import { SourcesTable } from "@/components/research/sources-table";
import { Timeline, toQuery, type TimelineItem } from "@/components/research/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  citedIndices,
  getConfigWithWake,
  streamResearch,
  type AgentConfig,
  type Depth,
  type DonePayload,
  type ToolName,
} from "@/lib/api";

// Each example targets a different capability: synthesis across many sources,
// a comparison the answer has to structure itself, and a question where the
// sources genuinely disagree — which is where the contradiction handling shows.
const EXAMPLES = [
  "What are the main technical barriers to enterprise adoption of AI coding agents?",
  "Compare the licence terms of the latest Llama, Mistral and DeepSeek model releases.",
  "How much electricity do AI data centres actually consume, and why do estimates disagree?",
];

type Phase = "idle" | "running" | "done" | "error";

export default function ResearchPage() {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [question, setQuestion] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [depth, setDepth] = useState<Depth>("standard");
  const [tools, setTools] = useState<ToolName[]>(["search_web", "search_corpus"]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [result, setResult] = useState<DonePayload | null>(null);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [tab, setTab] = useState("timeline");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [waiting, setWaiting] = useState("Planning the research");
  // The API sleeps on a free-tier host; waking it takes about a minute.
  const [waking, setWaking] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const startedAt = useRef(0);

  useEffect(() => {
    getConfigWithWake(() => setWaking(true))
      .then((c) => {
        setConfig(c);
        setWaking(false);
      })
      .catch(() => {
        setWaking(false);
        toast.error("Could not reach the research API", {
          description: "It may be restarting. Reload in a moment.",
        });
      });
  }, []);

  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => setElapsed((Date.now() - startedAt.current) / 1000), 100);
    return () => clearInterval(id);
  }, [phase]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("idle");
    toast("Run stopped");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && abortRef.current) stop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stop]);

  const openSource = useCallback((n: number) => setPreviewIndex(n), []);

  const run = useCallback(
    async (q: string) => {
      if (!q.trim()) return;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      startedAt.current = Date.now();
      setSubmitted(q);
      setElapsed(0);
      setPhase("running");
      setItems([]);
      setResult(null);
      setError("");
      setTab("timeline");
      setWaiting("Planning the research");

      try {
        await streamResearch(
          { question: q, depth, tools },
          (e) => {
            const at = Date.now();
            if (e.type === "step") {
              setWaiting(
                `Deciding what to do next (step ${e.data.step} of ${e.data.max_steps})`,
              );
            } else if (e.type === "llm") {
              setItems((prev) => [
                ...prev,
                {
                  kind: "llm",
                  model: e.data.model,
                  latency: e.data.latency_s,
                  tokensIn: e.data.prompt_tokens,
                  tokensOut: e.data.completion_tokens,
                  at,
                },
              ]);
            } else if (e.type === "retry") {
              setWaiting(`Provider returned ${e.data.error} — backing off ${e.data.delay_s}s`);
              setItems((prev) => [
                ...prev,
                {
                  kind: "retry",
                  attempt: e.data.attempt,
                  max: e.data.max_attempts,
                  delay: e.data.delay_s,
                  error: e.data.error,
                  at,
                },
              ]);
            } else if (e.type === "tool") {
              setWaiting("Reading the evidence");
              setItems((prev) => [
                ...prev,
                {
                  kind: "tool",
                  step: e.data.step,
                  tool: e.data.tool,
                  query: toQuery(e.data.arguments),
                  evidence: e.data.new_evidence,
                  at,
                },
              ]);
            } else if (e.type === "done") {
              setItems((prev) => [...prev, { kind: "done", steps: e.data.steps, at }]);
              setResult(e.data);
              setElapsed((Date.now() - startedAt.current) / 1000);
              setPhase("done");
              setTab("report");
              toast.success("Research complete");
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
    },
    [depth, tools],
  );

  const running = phase === "running";
  const maxSteps = config?.depth_budgets?.[depth] ?? 6;
  const cited = result ? citedIndices(result.answer) : new Set<number>();
  const previewEvidence =
    result && previewIndex ? (result.evidence[previewIndex - 1] ?? null) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {submitted || "New research"}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {config ? (
              <>
                Running <span className="font-mono">{config.model.split("/").pop()}</span>{" "}
                over web search and your documents
              </>
            ) : waking ? (
              "Waking the research API — free-tier instances sleep when idle, this takes about a minute…"
            ) : (
              "Connecting to the agent…"
            )}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {running && (
            <Badge variant="secondary" className="gap-1.5">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              running · {elapsed.toFixed(1)}s
            </Badge>
          )}
          {phase === "done" && (
            <Badge className="bg-[var(--success)]/10 text-[var(--success)] hover:bg-[var(--success)]/10">
              completed in {elapsed.toFixed(1)}s
            </Badge>
          )}
          {phase === "error" && <Badge variant="destructive">failed</Badge>}
        </div>
      </header>

      <ResearchForm
        question={question}
        setQuestion={setQuestion}
        depth={depth}
        setDepth={setDepth}
        tools={tools}
        setTools={setTools}
        running={running}
        onSubmit={() => run(question)}
        onStop={stop}
        config={config}
      />

      {phase === "idle" && !result && (
        <div className="mt-8 text-center">
          <div className="mx-auto grid size-10 place-items-center rounded-xl border bg-card">
            <Sparkles className="size-5 text-primary" />
          </div>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
            The agent plans its own searches, gathers evidence, and writes an answer
            with citations you can open and check. It searches the live web, and any
            documents you upload, so it can answer from sources the public internet
            does not have. Every step, passage and cost shown is recorded from the run
            itself.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => {
                  setQuestion(ex);
                  run(ex);
                }}
                className="rounded-full border bg-card px-3.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === "error" && (
        <Card className="mt-4 flex-row items-start gap-3 border-destructive/40 bg-destructive/5 p-4">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Run failed</div>
            <div className="mt-0.5 break-words font-mono text-xs text-muted-foreground">
              {error}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => run(submitted)}>
            Retry
          </Button>
        </Card>
      )}

      {(running || result) && (
        <div className="mt-6">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="timeline">
                Activity
                {items.length > 0 && (
                  <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                    {items.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="sources">
                Sources
                {result && (
                  <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                    {result.evidence.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="report">Report</TabsTrigger>
              <TabsTrigger value="run">Run</TabsTrigger>
            </TabsList>

            <TabsContent value="timeline" className="mt-4">
              <Card className="p-5">
                <Timeline items={items} running={running} waitingLabel={waiting} />
              </Card>
            </TabsContent>

            <TabsContent value="sources" className="mt-4">
              {result ? (
                <SourcesTable
                  evidence={result.evidence}
                  answer={result.answer}
                  onSelect={openSource}
                  selectedUrl={previewEvidence?.url}
                />
              ) : (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="report" className="mt-4">
              {result ? (
                <ReportView result={result} question={submitted} onCite={openSource} />
              ) : (
                <Card className="space-y-3 p-6">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-11/12" />
                  <Skeleton className="h-3 w-4/5" />
                </Card>
              )}
            </TabsContent>

            <TabsContent value="run" className="mt-4">
              {result ? (
                <RunStats result={result} totalSeconds={elapsed} maxSteps={maxSteps} />
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Timing, token and cost figures appear when the run completes.
                </p>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}

      <SourcePreview
        evidence={previewEvidence}
        index={previewIndex}
        cited={previewIndex ? cited.has(previewIndex) : false}
        open={previewIndex !== null}
        onOpenChange={(v) => !v && setPreviewIndex(null)}
      />
    </div>
  );
}
