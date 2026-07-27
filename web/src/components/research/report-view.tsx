"use client";

import { Check, Copy, Download, TriangleAlert } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { hostOf, isCorpus, type DonePayload, type Evidence } from "@/lib/api";

/** Secondary label for a reference: the domain for web, the chunk for a document. */
function locatorOf(e: Evidence): string {
  if (!isCorpus(e)) return hostOf(e.url);
  const chunk = e.url.split("#")[1];
  return chunk ? chunk.replace(/^chunk/, "chunk ") : "";
}

function linkCitations(answer: string) {
  return answer.replace(/\[(\d+)\]/g, (_, n) => `[[${n}]](#src-${n})`);
}

/** Markdown report with a numbered reference list built from real evidence. */
function toMarkdown(result: DonePayload, question: string): string {
  const refs = result.evidence
    .map((e, i) => `${i + 1}. ${e.title || hostOf(e.url)} — ${e.url}`)
    .join("\n");
  return `# ${question}\n\n${result.answer}\n\n## References\n\n${refs}\n`;
}

export function ReportView({
  result,
  question,
  onCite,
}: {
  result: DonePayload;
  question: string;
  onCite: (n: number) => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(toMarkdown(result, question));
    setCopied(true);
    toast.success("Report copied as Markdown");
    setTimeout(() => setCopied(false), 1800);
  };

  const download = (kind: "md" | "json") => {
    const body =
      kind === "md"
        ? toMarkdown(result, question)
        : JSON.stringify({ question, ...result }, null, 2);
    const blob = new Blob([body], {
      type: kind === "md" ? "text/markdown" : "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `research-${result.run_id}.${kind}`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`Exported ${kind.toUpperCase()}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Report
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copy} className="gap-1.5">
            {copied ? <Check className="size-3.5 text-[var(--success)]" /> : <Copy className="size-3.5" />}
            Copy
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="sm" className="gap-1.5" />}
            >
              <Download className="size-3.5" /> Export
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => download("md")}>
                Markdown (.md)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => download("json")}>
                Run data (.json)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {result.budget_exhausted && (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--warning)]" />
          <span>
            The step budget ran out before the agent finished gathering evidence, so it
            synthesized from what it had. Re-run at a deeper setting for full coverage.
          </span>
        </div>
      )}

      <article className="report-prose rounded-xl border bg-card p-5 sm:p-7">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => {
              if (href?.startsWith("#src-")) {
                const n = Number(href.slice(5));
                return (
                  <button
                    type="button"
                    onClick={() => onCite(n)}
                    aria-label={`Open source ${n}`}
                    className="cite mx-0.5 align-super text-[0.7em] font-semibold text-primary hover:underline"
                  >
                    {children}
                  </button>
                );
              }
              return (
                <a href={href} target="_blank" rel="noreferrer">
                  {children}
                </a>
              );
            },
          }}
        >
          {linkCitations(result.answer)}
        </ReactMarkdown>

        {result.evidence.length > 0 && (
          <>
            <hr className="my-6" />
            <h2 className="mb-3 text-lg font-semibold tracking-tight">References</h2>
            {/* Plain list, not <ol>: the [n] markers are the citation keys used
                in the answer, so browser list numbering would double them up. */}
            <ul className="list-none space-y-1 pl-0 text-sm">
              {result.evidence.map((e, i) => (
                <li key={e.url}>
                  <button
                    type="button"
                    onClick={() => onCite(i + 1)}
                    className="group flex w-full gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted"
                  >
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      [{i + 1}]
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="underline-offset-2 group-hover:underline">
                        {e.title || hostOf(e.url)}
                      </span>
                      {locatorOf(e) && (
                        <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                          · {locatorOf(e)}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </article>
    </div>
  );
}
