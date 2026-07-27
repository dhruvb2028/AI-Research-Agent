"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  Brain,
  ChevronRight,
  CircleCheck,
  Database,
  Globe,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { hostOf, isCorpus, type Evidence } from "@/lib/api";

/**
 * One entry per real agent event. This is a log of what the agent did —
 * tool calls, model calls, retries — not a scripted set of stages.
 */
export type TimelineItem =
  | { kind: "tool"; step: number; tool: string; query: string; evidence: Evidence[]; at: number }
  | { kind: "llm"; model: string; latency: number; tokensIn: number; tokensOut: number; at: number }
  | { kind: "retry"; attempt: number; max: number; delay: number; error: string; at: number }
  | { kind: "done"; steps: number; at: number };

function parseQuery(args: string) {
  try {
    return JSON.parse(args).query ?? args;
  } catch {
    return args;
  }
}

export function toQuery(args: string) {
  return parseQuery(args);
}

function Row({
  icon,
  tone = "default",
  children,
}: {
  icon: React.ReactNode;
  tone?: "default" | "warning" | "success";
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div
        className={cn(
          "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border bg-background",
          tone === "warning" && "border-[var(--warning)]/40 text-[var(--warning)]",
          tone === "success" && "border-[var(--success)]/40 text-[var(--success)]",
          tone === "default" && "text-muted-foreground",
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1 pb-4">{children}</div>
    </div>
  );
}

function ToolEntry({ item }: { item: Extract<TimelineItem, { kind: "tool" }> }) {
  const [open, setOpen] = useState(false);
  const corpus = item.tool === "search_corpus";
  const provider = item.evidence[0]?.source ?? (corpus ? "corpus" : "web");

  return (
    <Row icon={corpus ? <Database className="size-3.5" /> : <Globe className="size-3.5" />}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="group flex w-full items-start gap-2 text-left">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {corpus ? "Searched your documents" : "Searched the web"}
              </span>
              <Badge variant="secondary" className="h-5 font-mono text-[10px] font-normal">
                {provider}
              </Badge>
            </div>
            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
              {item.query}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              step {item.step} · {item.evidence.length} new source
              {item.evidence.length === 1 ? "" : "s"}
            </p>
          </div>
          <ChevronRight
            className={cn(
              "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 space-y-2 border-l pl-3">
            {item.evidence.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No new sources — these results were already retrieved.
              </p>
            ) : (
              item.evidence.map((e) => (
                <div key={e.url} className="text-xs">
                  <div className="font-medium">{e.title}</div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">
                    {isCorpus(e) ? hostOf(e.url) : e.url}
                  </div>
                  <p className="mt-1 line-clamp-2 text-muted-foreground">{e.snippet}</p>
                </div>
              ))
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Row>
  );
}

export function Timeline({
  items,
  running,
  waitingLabel,
}: {
  items: TimelineItem[];
  running: boolean;
  waitingLabel: string;
}) {
  return (
    <div className="relative">
      {items.length > 0 && (
        <div className="absolute bottom-4 left-[13.5px] top-2 w-px bg-border" aria-hidden />
      )}
      <div className="relative" aria-live="polite">
        <AnimatePresence initial={false}>
          {items.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
            >
              {item.kind === "tool" && <ToolEntry item={item} />}

              {item.kind === "llm" && (
                <Row icon={<Brain className="size-3.5" />}>
                  <div className="text-sm">Model call</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <span className="font-mono">{item.model.split("/").pop()}</span> ·{" "}
                    {item.latency.toFixed(1)}s · {item.tokensIn} in / {item.tokensOut} out
                  </p>
                </Row>
              )}

              {item.kind === "retry" && (
                <Row icon={<RotateCcw className="size-3.5" />} tone="warning">
                  <div className="text-sm">
                    Provider error — retrying ({item.attempt}/{item.max})
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <span className="font-mono">{item.error}</span> · backing off{" "}
                    {item.delay}s before retry
                  </p>
                </Row>
              )}

              {item.kind === "done" && (
                <Row icon={<CircleCheck className="size-3.5" />} tone="success">
                  <div className="text-sm">Answer synthesized</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    completed in {item.steps} step{item.steps === 1 ? "" : "s"}
                  </p>
                </Row>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {running && (
          <Row icon={<Loader2 className="size-3.5 animate-spin text-primary" />}>
            <div className="text-sm text-muted-foreground">{waitingLabel}</div>
          </Row>
        )}
      </div>

      {!running && items.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          The agent&apos;s activity will appear here as it works.
        </p>
      )}
    </div>
  );
}
