import { motion } from "motion/react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DoneEvent } from "@/lib/sse";

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  const body = (
    <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm text-foreground">{value}</div>
    </div>
  );
  if (!hint) return body;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="cursor-help text-left">
          {body}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-xs">{hint}</TooltipContent>
    </Tooltip>
  );
}

export function StatsBar({
  trace,
  steps,
  totalSeconds,
}: {
  trace: DoneEvent["trace"];
  steps: number;
  totalSeconds: number;
}) {
  const llmS = trace.llm_seconds ?? 0;
  const toolS = trace.tool_seconds ?? 0;
  const llmShare = totalSeconds > 0 ? Math.round((llmS / totalSeconds) * 100) : 0;

  return (
    <TooltipProvider delayDuration={200}>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="space-y-3"
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="wall clock" value={`${totalSeconds.toFixed(1)}s`} />
          <Stat label="steps" value={`${steps} / 6`} hint="Hard step budget — the loop can never run away." />
          <Stat label="llm" value={`${trace.llm_calls ?? 0} · ${llmS.toFixed(1)}s`} />
          <Stat label="tools" value={`${trace.tool_calls ?? 0} · ${toolS.toFixed(1)}s`} />
          <Stat
            label="tokens"
            value={`${trace.prompt_tokens ?? 0}/${trace.completion_tokens ?? 0}`}
            hint="Prompt tokens in / completion tokens out."
          />
          <Stat
            label="cost*"
            value={`$${(trace.est_cost_usd ?? 0).toFixed(4)}`}
            hint="Would-be cost at paid-host rates. Actual spend on this stack is $0 — every provider is on a free tier."
          />
        </div>

        {/* Where the time actually went — LLM queue time usually dominates. */}
        <div>
          <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>time split</span>
            <span>{llmShare}% llm</span>
          </div>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="bg-accent"
              initial={{ width: 0 }}
              animate={{ width: `${llmShare}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
            <div className="flex-1 bg-secondary" />
          </div>
        </div>
      </motion.div>
    </TooltipProvider>
  );
}
