"use client";

import { ArrowUp, Database, Globe, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { AgentConfig, Depth, ToolName } from "@/lib/api";

const DEPTH_LABEL: Record<Depth, string> = {
  quick: "Quick — 3 steps",
  standard: "Standard — 6 steps",
  deep: "Deep — 12 steps",
};

const SOURCES: { id: ToolName; label: string; hint: string; icon: typeof Globe }[] = [
  {
    id: "search_web",
    label: "Web",
    hint: "Live web search via Tavily, falling back to Serper if a quota runs out.",
    icon: Globe,
  },
  {
    id: "search_corpus",
    label: "Your documents",
    hint:
      "Search documents you have uploaded, by meaning rather than keywords. " +
      "Manage them on the Your documents page.",
    icon: Database,
  },
];

export function ResearchForm({
  question,
  setQuestion,
  depth,
  setDepth,
  tools,
  setTools,
  running,
  onSubmit,
  onStop,
  config,
}: {
  question: string;
  setQuestion: (v: string) => void;
  depth: Depth;
  setDepth: (d: Depth) => void;
  tools: ToolName[];
  setTools: (t: ToolName[]) => void;
  running: boolean;
  onSubmit: () => void;
  onStop: () => void;
  config: AgentConfig | null;
}) {
  const toggleTool = (id: ToolName) => {
    // At least one retrieval tool must stay on — the backend rejects an empty set.
    if (tools.includes(id)) {
      if (tools.length > 1) setTools(tools.filter((t) => t !== id));
    } else {
      setTools([...tools, id]);
    }
  };

  const budget = config?.depth_budgets?.[depth];

  return (
    <Card className="p-4 sm:p-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <Label htmlFor="question" className="text-xs font-medium text-muted-foreground">
            Research question
          </Label>
          <Textarea
            id="question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onSubmit();
              }
            }}
            placeholder="What would you like researched? The agent will plan its own searches and cite what it finds."
            maxLength={2000}
            rows={3}
            className="resize-none bg-background text-[15px]"
          />
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Depth</Label>
            <Select value={depth} onValueChange={(v) => v && setDepth(v as Depth)}>
              <SelectTrigger className="w-[190px] bg-background">
                <SelectValue>{DEPTH_LABEL[depth]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(DEPTH_LABEL) as Depth[]).map((d) => (
                  <SelectItem key={d} value={d}>
                    {DEPTH_LABEL[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Sources</Label>
            <div className="flex gap-2">
              {SOURCES.map(({ id, label, hint, icon: Icon }) => {
                const on = tools.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleTool(id)}
                    title={hint}
                    aria-pressed={on}
                    className={cn(
                      "flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors",
                      on
                        ? "border-primary/40 bg-accent text-accent-foreground"
                        : "bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {budget && (
              <span className="hidden text-xs text-muted-foreground sm:block">
                budget: {budget} steps
              </span>
            )}
            {running ? (
              <Button type="button" variant="secondary" onClick={onStop} className="gap-2">
                <Square className="size-3.5 fill-current" /> Stop
              </Button>
            ) : (
              <Button type="submit" disabled={!question.trim()} className="gap-2">
                Start research
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </form>
    </Card>
  );
}

