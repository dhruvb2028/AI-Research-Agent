import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, FolderSearch, Globe, Loader2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { ToolEvent } from "@/lib/sse";

function parseQuery(args: string): string {
  try {
    return JSON.parse(args).query ?? args;
  } catch {
    return args;
  }
}

/** Provider label from the normalized `source` field ("corpus/pinecone", "tavily"). */
function providerOf(e: ToolEvent): string {
  const src = e.new_evidence[0]?.source;
  if (!src) return e.tool === "search_corpus" ? "corpus" : "web";
  return src.startsWith("corpus/") ? `corpus · ${src.split("/")[1]} rerank` : src;
}

function StepCard({ event, index }: { event: ToolEvent; index: number }) {
  const [open, setOpen] = useState(false);
  const isCorpus = event.tool === "search_corpus";
  const Icon = isCorpus ? FolderSearch : Globe;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.2) }}
      layout
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          className={cn(
            "group flex w-full items-start gap-3 rounded-lg border border-border/60",
            "bg-card p-3 text-left transition-colors hover:border-border hover:bg-card/80",
          )}
        >
          <Icon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-[13px] text-foreground">
              {parseQuery(event.arguments)}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant="outline" className="h-5 font-mono text-[10px] font-normal">
                {providerOf(event)}
              </Badge>
              <span>step {event.step}</span>
              <span aria-hidden>·</span>
              <span>
                {event.new_evidence.length} new source
                {event.new_evidence.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <ChevronRight
            className={cn(
              "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200",
              open && "rotate-90",
            )}
            aria-hidden
          />
        </CollapsibleTrigger>

        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-none">
          <div className="ml-7 mt-1 space-y-2 border-l border-border/60 pl-4">
            {event.new_evidence.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">
                No new sources — results were already retrieved earlier.
              </p>
            ) : (
              event.new_evidence.map((ev) => (
                <div key={ev.url} className="py-1.5">
                  <div className="text-[13px] font-medium text-foreground">{ev.title}</div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">
                    {ev.url}
                  </div>
                  <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                    {ev.snippet}
                  </p>
                </div>
              ))
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </motion.div>
  );
}

export function ProgressFeed({
  events,
  running,
}: {
  events: ToolEvent[];
  running: boolean;
}) {
  if (!running && events.length === 0) return null;
  return (
    <div className="space-y-2" aria-live="polite">
      <AnimatePresence initial={false}>
        {events.map((e, i) => (
          <StepCard key={`${e.step}-${i}`} event={e} index={i} />
        ))}
      </AnimatePresence>
      {running && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-2 px-1 py-2 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin text-accent" aria-hidden />
          {events.length === 0 ? "Planning research…" : "Reading evidence and reasoning…"}
        </motion.div>
      )}
    </div>
  );
}
