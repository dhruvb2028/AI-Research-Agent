import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, ArrowUp, Search, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnswerCard } from "@/components/AnswerCard";
import { ProgressFeed } from "@/components/ProgressFeed";
import { SourcesPanel } from "@/components/SourcesPanel";
import { StatsBar } from "@/components/StatsBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type DoneEvent, type ToolEvent, streamResearch } from "@/lib/sse";

const EXAMPLES = [
  "What did NVIDIA announce at GTC 2026?",
  "Why was Brave dropped from this project's search chain?",
  "Which is taller: the Eiffel Tower or the UN headquarters?",
];

type Phase = "idle" | "running" | "done" | "error";

export default function App() {
  const [question, setQuestion] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const [result, setResult] = useState<DoneEvent | null>(null);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [tab, setTab] = useState("timeline");
  const abortRef = useRef<AbortController | null>(null);
  const startedAt = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Live elapsed timer — long runs need to prove they're still alive.
  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => setElapsed((Date.now() - startedAt.current) / 1000), 100);
    return () => clearInterval(id);
  }, [phase]);

  // "/" focuses the input, Escape cancels a run.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "Escape" && abortRef.current) {
        cancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const cancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("idle");
  };

  const jumpToSource = useCallback((index: number) => {
    setTab("sources");
    requestAnimationFrame(() => {
      const el = document.getElementById(`src-${index}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.setAttribute("data-flash", "true");
      setTimeout(() => el?.removeAttribute("data-flash"), 1600);
    });
  }, []);

  const run = useCallback(async (q: string) => {
    if (!q.trim()) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    startedAt.current = Date.now();
    setElapsed(0);
    setPhase("running");
    setToolEvents([]);
    setResult(null);
    setError("");
    setTab("timeline");
    try {
      await streamResearch(
        q,
        (e) => {
          if (e.type === "tool") setToolEvents((prev) => [...prev, e.data]);
          else if (e.type === "done") {
            setResult(e.data);
            setElapsed((Date.now() - startedAt.current) / 1000);
            setPhase("done");
          } else if (e.type === "error") {
            setError(e.data.message);
            setPhase("error");
          }
        },
        ctrl.signal,
      );
    } catch (err) {
      if (!ctrl.signal.aborted) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    }
  }, []);

  const running = phase === "running";

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3">
          <Search className="size-5 text-accent" aria-hidden />
          <h1 className="text-base font-semibold tracking-tight">Research Agent</h1>
          <Badge variant="outline" className="ml-1 font-mono text-[10px] font-normal">
            web + private corpus
          </Badge>
          {(running || phase === "done") && (
            <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
              {elapsed.toFixed(1)}s
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Ask */}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(question);
          }}
        >
          <Input
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a research question…   (press / to focus)"
            aria-label="Research question"
            maxLength={2000}
            className="h-12 bg-card text-[15px]"
          />
          {running ? (
            <Button type="button" variant="secondary" onClick={cancel} className="h-12 gap-2 px-5">
              <Square className="size-3.5 fill-current" aria-hidden /> Stop
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={!question.trim()}
              className="h-12 gap-2 bg-accent px-5 font-semibold text-accent-foreground hover:bg-accent/90"
            >
              Research <ArrowUp className="size-4" aria-hidden />
            </Button>
          )}
        </form>

        {/* Empty state */}
        {phase === "idle" && !result && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-10 text-center"
          >
            <p className="mx-auto max-w-lg text-sm leading-relaxed text-muted-foreground">
              An agent that plans its own research: it searches the live web and a private
              document corpus, cross-checks what it finds, and answers with citations you
              can inspect — every step, source, and cost shown below.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setQuestion(ex);
                    run(ex);
                  }}
                  className="rounded-full border border-border/60 bg-card px-3.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground"
                >
                  {ex}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Error */}
        <AnimatePresence>
          {phase === "error" && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-red-300"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div className="flex-1">
                <div className="font-medium">Run failed</div>
                <div className="mt-0.5 font-mono text-xs opacity-90">{error}</div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => run(question)}>
                Retry
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Two-pane workspace */}
        {(running || result) && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-4">
              {result ? (
                <AnswerCard
                  answer={result.answer}
                  budgetExhausted={result.budget_exhausted}
                  onCite={jumpToSource}
                />
              ) : (
                <div className="rounded-xl border border-border/60 bg-card p-5">
                  <div className="mb-3 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Answer
                  </div>
                  <div className="space-y-2">
                    {[100, 92, 96, 60].map((w, i) => (
                      <motion.div
                        key={i}
                        className="h-3 rounded bg-muted"
                        style={{ width: `${w}%` }}
                        animate={{ opacity: [0.4, 0.75, 0.4] }}
                        transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.12 }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Inspector */}
            <aside className="min-w-0">
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="timeline" className="text-xs">
                    Timeline
                    {toolEvents.length > 0 && (
                      <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                        {toolEvents.length}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="sources" className="text-xs">
                    Sources
                    {result && (
                      <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                        {result.evidence.length}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="run" className="text-xs">
                    Run
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="timeline" className="mt-3">
                  <ProgressFeed events={toolEvents} running={running} />
                </TabsContent>

                <TabsContent value="sources" className="mt-3">
                  {result ? (
                    <SourcesPanel evidence={result.evidence} answer={result.answer} />
                  ) : (
                    <p className="px-2 py-6 text-sm text-muted-foreground">
                      Sources appear as the agent retrieves them.
                    </p>
                  )}
                </TabsContent>

                <TabsContent value="run" className="mt-3">
                  {result ? (
                    <StatsBar
                      trace={result.trace}
                      steps={result.steps}
                      totalSeconds={elapsed}
                    />
                  ) : (
                    <p className="px-2 py-6 text-sm text-muted-foreground">
                      Timing, token, and cost breakdown appears when the run completes.
                    </p>
                  )}
                </TabsContent>
              </Tabs>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
