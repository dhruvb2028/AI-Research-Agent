import { ChevronRight, ExternalLink, FileText } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { Evidence } from "@/lib/sse";

function host(url: string): string {
  if (url.startsWith("corpus://")) return url.slice("corpus://".length);
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Which [n] indices the answer actually cites — uncited sources are labeled honestly. */
function citedIndices(answer: string): Set<number> {
  return new Set(Array.from(answer.matchAll(/\[(\d+)\]/g), (m) => Number(m[1])));
}

function SourceRow({
  evidence,
  index,
  cited,
}: {
  evidence: Evidence;
  index: number;
  cited: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isCorpus = evidence.url.startsWith("corpus://");

  return (
    <Collapsible open={open} onOpenChange={setOpen} id={`src-${index}`}>
      <CollapsibleTrigger
        className={cn(
          "group flex w-full items-start gap-3 rounded-lg border border-transparent p-2.5 text-left",
          "transition-colors hover:border-border/60 hover:bg-card",
          "data-[flash=true]:border-accent data-[flash=true]:bg-accent/10",
        )}
      >
        <span className="mt-0.5 w-7 shrink-0 font-mono text-xs text-muted-foreground">
          [{index}]
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-foreground">
              {evidence.title || host(evidence.url)}
            </span>
            {isCorpus && (
              <Badge className="h-5 shrink-0 border-accent/40 bg-accent/10 text-[10px] font-normal text-accent hover:bg-accent/10">
                <FileText className="mr-1 size-2.5" aria-hidden />
                corpus
              </Badge>
            )}
            {!cited && (
              <Badge
                variant="outline"
                className="h-5 shrink-0 text-[10px] font-normal text-muted-foreground"
              >
                not cited
              </Badge>
            )}
          </div>
          <div className="truncate font-mono text-[11px] text-muted-foreground">
            {host(evidence.url)}
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

      <CollapsibleContent>
        <div className="ml-10 mr-2 space-y-2 border-l border-border/60 pb-2 pl-4">
          {evidence.query && (
            <p className="pt-2 text-xs text-muted-foreground">
              retrieved by:{" "}
              <span className="font-mono text-foreground">{evidence.query}</span>
            </p>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">
            {evidence.snippet}
          </p>
          {!isCorpus && (
            <a
              href={evidence.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
            >
              Open source <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SourcesPanel({
  evidence,
  answer,
}: {
  evidence: Evidence[];
  answer: string;
}) {
  if (evidence.length === 0) {
    return (
      <p className="px-2 py-6 text-sm text-muted-foreground">
        No sources retrieved for this run.
      </p>
    );
  }
  const cited = citedIndices(answer);
  return (
    <div className="space-y-0.5">
      {evidence.map((ev, i) => (
        <SourceRow
          key={ev.url}
          evidence={ev}
          index={i + 1}
          cited={cited.has(i + 1)}
        />
      ))}
    </div>
  );
}
