"use client";

import { ExternalLink, FileText, Globe, Search } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { hostOf, isCorpus, type Evidence } from "@/lib/api";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 truncate font-mono text-sm">{value}</div>
    </div>
  );
}

/**
 * Full-size modal rather than a slide-over: tracing a citation means reading a
 * passage and comparing it to the claim, which needs width, not a narrow rail.
 */
export function SourcePreview({
  evidence,
  index,
  cited,
  open,
  onOpenChange,
}: {
  evidence: Evidence | null;
  index: number | null;
  cited: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  if (!evidence) return null;
  const corpus = isCorpus(evidence);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-full flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="space-y-2 border-b p-5 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1.5 font-mono text-[10px] font-normal">
              {corpus ? <FileText className="size-3" /> : <Globe className="size-3" />}
              {evidence.source}
            </Badge>
            {cited ? (
              <Badge className="bg-[var(--success)]/10 text-[var(--success)] hover:bg-[var(--success)]/10">
                cited in the report as [{index}]
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                retrieved but not cited
              </Badge>
            )}
          </div>
          <DialogTitle className="text-base leading-snug">
            {evidence.title || hostOf(evidence.url)}
          </DialogTitle>
          <DialogDescription className="break-all font-mono text-xs">
            {evidence.url}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 border-b px-5 py-3 sm:grid-cols-3">
          <Stat
            label="Relevance"
            value={
              typeof evidence.score === "number" ? (
                evidence.score.toFixed(4)
              ) : (
                <span className="text-muted-foreground">not provided</span>
              )
            }
          />
          {typeof evidence.rank === "number" && (
            <Stat label="SERP rank" value={`#${evidence.rank}`} />
          )}
          <Stat
            label="Source type"
            value={corpus ? "your document" : "web page"}
          />
        </div>

        {evidence.query && (
          <div className="flex items-start gap-2 border-b bg-muted/40 px-5 py-3">
            <Search className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Found by this search
              </div>
              <div className="mt-0.5 font-mono text-sm">{evidence.query}</div>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <h3 className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            Exact text the model read
          </h3>
          <div className="report-prose rounded-lg border bg-muted/30 p-4 text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{evidence.snippet}</ReactMarkdown>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {corpus
              ? "The complete chunk retrieved from your document — nothing between this text and the model's context."
              : "The snippet the search provider returned; the agent did not read the full page."}
          </p>
        </div>

        {!corpus && (
          <div className="border-t p-4">
            <Button
              variant="outline"
              className="w-full gap-2"
              nativeButton={false}
              render={<a href={evidence.url} target="_blank" rel="noreferrer" />}
            >
              Open original source <ExternalLink className="size-3.5" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
