import { AlertTriangle, Check, Copy } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";

// Turn [n] citations into anchor links targeting the sources panel.
function linkCitations(answer: string): string {
  return answer.replace(/\[(\d+)\]/g, (_, n) => `[[${n}]](#src-${n})`);
}

export function AnswerCard({
  answer,
  budgetExhausted,
  onCite,
}: {
  answer: string;
  budgetExhausted: boolean;
  onCite: (index: number) => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border border-border/60 bg-card p-5"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Answer
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={copy}
          className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          {copied ? (
            <>
              <Check className="size-3 text-accent" aria-hidden /> Copied
            </>
          ) : (
            <>
              <Copy className="size-3" aria-hidden /> Copy
            </>
          )}
        </Button>
      </div>

      <div className="prose-answer">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => {
              if (href?.startsWith("#src-")) {
                const idx = Number(href.slice(5));
                return (
                  <button
                    type="button"
                    className="cite align-super text-[0.7em] font-semibold text-accent hover:underline"
                    onClick={() => onCite(idx)}
                    aria-label={`Jump to source ${idx}`}
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
          {linkCitations(answer)}
        </ReactMarkdown>
      </div>

      {budgetExhausted && (
        <div
          role="note"
          className="mt-4 flex items-start gap-2 rounded-lg border border-amber-600/50 bg-amber-500/10 p-3 text-sm text-amber-300"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Step budget reached — the agent synthesized from partial evidence, so this
            answer may be incomplete.
          </span>
        </div>
      )}
    </motion.div>
  );
}
