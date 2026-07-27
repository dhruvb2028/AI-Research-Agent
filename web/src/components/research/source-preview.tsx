"use client";

import { ExternalLink, FileText, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { hostOf, isCorpus, type Evidence } from "@/lib/api";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-mono text-xs">{value}</span>
    </div>
  );
}

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <div className="flex items-center gap-2">
            {corpus ? (
              <FileText className="size-4 text-primary" />
            ) : (
              <Globe className="size-4 text-primary" />
            )}
            <Badge variant="secondary" className="font-mono text-[10px] font-normal">
              {evidence.source}
            </Badge>
            {cited ? (
              <Badge className="bg-[var(--success)]/10 text-[var(--success)] hover:bg-[var(--success)]/10">
                cited as [{index}]
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                retrieved, not cited
              </Badge>
            )}
          </div>
          <SheetTitle className="text-left text-base leading-snug">
            {evidence.title || hostOf(evidence.url)}
          </SheetTitle>
          <SheetDescription className="text-left font-mono text-xs">
            {hostOf(evidence.url)}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          <div className="rounded-lg border bg-muted/40 px-3 py-1">
            <Field
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
              <Field label="SERP rank" value={`#${evidence.rank}`} />
            )}
            <Field label="Retrieved by" value={evidence.query ?? "—"} />
          </div>

          <div>
            <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Passage the agent read
            </h3>
            <p className="whitespace-pre-wrap rounded-lg border bg-card p-3 text-sm leading-relaxed">
              {evidence.snippet}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              This is the exact text placed in the model&apos;s context — for corpus
              results, the full retrieved chunk.
            </p>
          </div>

          {!corpus && (
            <>
              <Separator />
              <Button
                variant="outline"
                className="w-full gap-2"
                nativeButton={false}
                render={<a href={evidence.url} target="_blank" rel="noreferrer" />}
              >
                Open original source <ExternalLink className="size-3.5" />
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
