"use client";

import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DonePayload } from "@/lib/api";

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  const body = (
    <Card className="gap-1 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-lg tabular-nums">{value}</div>
    </Card>
  );
  if (!hint) return body;
  return (
    <Tooltip>
      <TooltipTrigger render={<div className="cursor-help" />}>{body}</TooltipTrigger>
      <TooltipContent className="max-w-64">{hint}</TooltipContent>
    </Tooltip>
  );
}

export function RunStats({
  result,
  totalSeconds,
  maxSteps,
}: {
  result: DonePayload;
  totalSeconds: number;
  maxSteps: number;
}) {
  const t = result.trace;
  const llm = t.llm_seconds ?? 0;
  const tool = t.tool_seconds ?? 0;
  const llmShare = totalSeconds > 0 ? Math.round((llm / totalSeconds) * 100) : 0;
  const cited = new Set(Array.from(result.answer.matchAll(/\[(\d+)\]/g), (m) => Number(m[1])));

  return (
    <TooltipProvider delay={200}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Metric label="wall clock" value={`${totalSeconds.toFixed(1)}s`} />
          <Metric
            label="steps used"
            value={`${result.steps} / ${maxSteps}`}
            hint="A hard step budget bounds the loop so it can never run away; hitting it forces synthesis from partial evidence."
          />
          <Metric label="model calls" value={String(t.llm_calls ?? 0)} />
          <Metric label="tool calls" value={String(t.tool_calls ?? 0)} />
          <Metric
            label="tokens"
            value={`${((t.prompt_tokens ?? 0) / 1000).toFixed(1)}k`}
            hint={`${t.prompt_tokens ?? 0} prompt + ${t.completion_tokens ?? 0} completion tokens.`}
          />
          <Metric
            label="cost*"
            value={`$${(t.est_cost_usd ?? 0).toFixed(4)}`}
            hint="Cost this run would have incurred at paid-host token rates. Actual spend is $0 — every provider in the stack is on a free tier."
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Where the time went</span>
            <span className="font-mono">{llmShare}% model</span>
          </div>
          <Progress value={llmShare} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {llm.toFixed(1)}s waiting on the model, {tool.toFixed(1)}s in retrieval.
            Model latency dominates on the free tier.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Evidence used</span>
            <span className="font-mono">
              {cited.size} / {result.evidence.length} cited
            </span>
          </div>
          <Progress
            value={
              result.evidence.length ? (cited.size / result.evidence.length) * 100 : 0
            }
            className="h-2"
          />
          <p className="text-xs text-muted-foreground">
            Retrieved sources the answer did not cite are kept and labelled rather than
            hidden — unused retrieval is a real signal about search quality.
          </p>
        </div>
      </div>
    </TooltipProvider>
  );
}
