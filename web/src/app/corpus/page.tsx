"use client";

import { CircleAlert, Database, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getConfig, getCorpus, type AgentConfig, type CorpusStats } from "@/lib/api";

export default function CorpusPage() {
  const [stats, setStats] = useState<CorpusStats | null>(null);
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getCorpus()
      .then(setStats)
      .catch((e) => setError(String(e)));
    getConfig().then(setConfig).catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Project docs</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          A document index the agent can search alongside the web. This deployment
          indexes the project&apos;s own engineering decision log — so when the agent
          answers a question about why a provider was dropped or a model swapped, that
          answer is grounded in documents that do not exist on the public web and
          cannot have come from the model&apos;s training data.
        </p>
      </header>

      {error && (
        <Card className="flex-row items-center gap-2 border-destructive/40 bg-destructive/5 p-4 text-sm">
          <CircleAlert className="size-4 text-destructive" />
          <span className="font-mono text-xs">{error}</span>
        </Card>
      )}

      {!stats && !error && <Skeleton className="h-32 w-full" />}

      {stats && !stats.available && (
        <Card className="flex-row items-start gap-3 border-[var(--warning)]/40 bg-[var(--warning)]/5 p-4">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-[var(--warning)]" />
          <div>
            <div className="text-sm font-medium">Document index unavailable</div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{stats.error}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Web search still works — the agent degrades to web-only rather than
              failing the run.
            </p>
          </div>
        </Card>
      )}

      {stats?.available && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="gap-1 p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Documents
              </div>
              <div className="font-mono text-3xl">{stats.documents?.length ?? 0}</div>
            </Card>
            <Card className="gap-1 p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Indexed chunks
              </div>
              <div className="font-mono text-3xl">{stats.vectors?.toLocaleString()}</div>
            </Card>
            <Card className="gap-1 p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Embedding dimension
              </div>
              <div className="font-mono text-3xl">{stats.dimension}</div>
              <p className="text-xs text-muted-foreground">
                Truncated from 3072 to fit free-tier storage
              </p>
            </Card>
          </div>

          {stats.documents && stats.documents.length > 0 && (
            <Card className="mt-4 gap-3 p-4">
              <h2 className="text-sm font-medium">Indexed documents</h2>
              <div className="divide-y">
                {stats.documents.map((d) => (
                  <div key={d.doc} className="flex items-center gap-3 py-2.5">
                    <FileText className="size-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate font-mono text-sm">
                      {d.doc}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {d.chunks} chunk{d.chunks === 1 ? "" : "s"}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Add documents by running{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                  python -m app.retrieval.ingest &lt;path&gt;
                </code>{" "}
                — chunks are content-hashed, so re-running only embeds what changed.
              </p>
            </Card>
          )}
        </>
      )}

      {config && (
        <Card className="mt-4 gap-3 p-4">
          <div className="flex items-center gap-2">
            <Database className="size-4 text-primary" />
            <h2 className="text-sm font-medium">How a document search works</h2>
          </div>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">1. Embed</span> — the
              agent&apos;s search phrase is converted to a vector with
              gemini-embedding-001, truncated to {stats?.dimension ?? 768} dimensions
              and re-normalised.
            </li>
            <li>
              <span className="font-medium text-foreground">2. Vector search</span> —
              the {config.retrieval.top_k} closest chunks by cosine similarity. This
              matches on meaning, so a question about &ldquo;dropping a search
              provider&rdquo; finds the right passage even without shared keywords.
            </li>
            <li>
              <span className="font-medium text-foreground">3. Rerank</span> — a hosted
              cross-encoder rescores those candidates against the query together and
              keeps the top {config.retrieval.top_n}. If its quota is exhausted it falls
              back to a second provider, then to no reranking — a run never fails
              because a quality enhancer is unavailable.
            </li>
          </ol>
        </Card>
      )}
    </div>
  );
}
