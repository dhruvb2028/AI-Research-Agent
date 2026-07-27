"use client";

import {
  ArrowLeft,
  Brain,
  CircleAlert,
  Database,
  Globe,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ReportView } from "@/components/research/report-view";
import { RunStats } from "@/components/research/run-stats";
import { SourcePreview } from "@/components/research/source-preview";
import { SourcesTable } from "@/components/research/sources-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { citedIndices, getRun, type RunDetail, type TimelineEvent } from "@/lib/api";

function EventRow({ e }: { e: TimelineEvent }) {
  const icon =
    e.type === "llm_call" ? (
      <Brain className="size-3.5" />
    ) : e.type === "llm_retry" ? (
      <RotateCcw className="size-3.5 text-[var(--warning)]" />
    ) : e.tool === "search_corpus" ? (
      <Database className="size-3.5" />
    ) : (
      <Globe className="size-3.5" />
    );

  return (
    <div className="flex gap-3 border-b py-3 last:border-0">
      <span className="w-12 shrink-0 pt-0.5 text-right font-mono text-xs text-muted-foreground">
        {e.offset_s.toFixed(1)}s
      </span>
      <div className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border bg-background text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        {e.type === "llm_call" && (
          <>
            <div className="text-sm">Model call</div>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              {e.model?.split("/").pop()} · {e.latency_s?.toFixed(1)}s · {e.prompt_tokens}{" "}
              in / {e.completion_tokens} out
            </p>
          </>
        )}
        {e.type === "tool_call" && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm">
                {e.tool === "search_corpus" ? "Searched your documents" : "Searched the web"}
              </span>
              {e.provider && (
                <Badge variant="secondary" className="h-5 font-mono text-[10px] font-normal">
                  {e.provider}
                </Badge>
              )}
            </div>
            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
              {e.query}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {e.error ? (
                <span className="text-destructive">{e.error}</span>
              ) : (
                <>
                  {e.results} result{e.results === 1 ? "" : "s"} · {e.latency_s?.toFixed(1)}s
                </>
              )}
            </p>
          </>
        )}
        {e.type === "llm_retry" && (
          <>
            <div className="text-sm">Provider error — retried</div>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              attempt {e.attempt} · {e.error} · backed off {e.delay_s}s
            </p>
          </>
        )}
        {e.type === "tool_error" && (
          <>
            <div className="text-sm">Tool error</div>
            <p className="mt-0.5 font-mono text-xs text-destructive">{e.error}</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [error, setError] = useState("");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    getRun(id)
      .then(setRun)
      .catch((e) => setError(String(e)));
  }, [id]);

  const cited = run?.answer ? citedIndices(run.answer) : new Set<number>();
  const previewEvidence =
    run && previewIndex ? (run.evidence[previewIndex - 1] ?? null) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <Button
        variant="ghost"
        size="sm"
        className="mb-3 -ml-2 gap-1.5 text-muted-foreground"
        // Rendering an anchor, so opt out of native <button> semantics.
        nativeButton={false}
        render={<Link href="/library" />}
      >
        <ArrowLeft className="size-3.5" /> Library
      </Button>

      {error && (
        <Card className="flex-row items-center gap-2 border-destructive/40 bg-destructive/5 p-4 text-sm">
          <CircleAlert className="size-4 text-destructive" />
          Could not load this run: <span className="font-mono text-xs">{error}</span>
        </Card>
      )}

      {!run && !error && (
        <div className="space-y-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {run && (
        <>
          <header className="mb-5">
            <h1 className="text-xl font-semibold tracking-tight">{run.question}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono text-xs">{run.run_id}</span>
              <span aria-hidden>·</span>
              <span>{new Date(run.started_at * 1000).toLocaleString()}</span>
              <span aria-hidden>·</span>
              <span className="font-mono text-xs">{run.model.split("/").pop()}</span>
              {run.budget_exhausted && (
                <Badge className="gap-1 bg-[var(--warning)]/10 text-[var(--warning)] hover:bg-[var(--warning)]/10">
                  <TriangleAlert className="size-3" /> budget exhausted
                </Badge>
              )}
              {run.retries > 0 && (
                <Badge variant="outline" className="gap-1">
                  <RotateCcw className="size-3" /> {run.retries}{" "}
                  {run.retries === 1 ? "retry" : "retries"}
                </Badge>
              )}
              {!run.completed && (
                <Badge variant="outline" className="text-muted-foreground">
                  incomplete
                </Badge>
              )}
            </div>
          </header>

          <Tabs defaultValue={run.answer ? "report" : "activity"}>
            <TabsList>
              <TabsTrigger value="report">Report</TabsTrigger>
              <TabsTrigger value="activity">
                Activity
                <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                  {run.timeline.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="sources">
                Sources
                <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                  {run.evidence.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="run">Run</TabsTrigger>
            </TabsList>

            <TabsContent value="report" className="mt-4">
              {run.answer ? (
                <ReportView
                  result={{
                    run_id: run.run_id,
                    answer: run.answer,
                    evidence: run.evidence,
                    steps: run.steps ?? 0,
                    budget_exhausted: run.budget_exhausted,
                    trace: run.trace,
                  }}
                  question={run.question}
                  onCite={setPreviewIndex}
                />
              ) : (
                <Card className="p-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    This run predates result persistence, so its answer was never written
                    to the trace. Its activity log and metrics below are complete — newer
                    runs store the full report.
                  </p>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
              <Card className="px-5 py-1">
                {run.timeline.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No activity events recorded for this run.
                  </p>
                ) : (
                  run.timeline.map((e, i) => <EventRow key={i} e={e} />)
                )}
              </Card>
            </TabsContent>

            <TabsContent value="sources" className="mt-4">
              {run.evidence.length > 0 ? (
                <SourcesTable
                  evidence={run.evidence}
                  answer={run.answer ?? ""}
                  onSelect={setPreviewIndex}
                  selectedUrl={previewEvidence?.url}
                />
              ) : (
                <Card className="p-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No sources stored for this run.
                  </p>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="run" className="mt-4">
              <RunStats
                result={{
                  run_id: run.run_id,
                  answer: run.answer ?? "",
                  evidence: run.evidence,
                  steps: run.steps ?? 0,
                  budget_exhausted: run.budget_exhausted,
                  trace: run.trace,
                }}
                totalSeconds={run.duration_s}
                maxSteps={run.max_steps ?? 6}
              />
            </TabsContent>
          </Tabs>

          <SourcePreview
            evidence={previewEvidence}
            index={previewIndex}
            cited={previewIndex ? cited.has(previewIndex) : false}
            open={previewIndex !== null}
            onOpenChange={(v) => !v && setPreviewIndex(null)}
          />
        </>
      )}
    </div>
  );
}
