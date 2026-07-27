"use client";

import { CircleAlert, Database } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { DocumentManager } from "@/components/corpus/document-manager";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getConfig, getCorpus, type AgentConfig, type CorpusStats } from "@/lib/api";

export default function CorpusPage() {
  const [stats, setStats] = useState<CorpusStats | null>(null);
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    getCorpus()
      .then(setStats)
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    refresh();
    getConfig().then(setConfig).catch(() => {});
  }, [refresh]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Your documents</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Upload documents and the agent can research across them alongside the live
          web — answering from sources the public internet does not have. Files are
          split into chunks, embedded, and searched by meaning rather than keywords.
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
        <div className="space-y-4">
          <DocumentManager documents={stats.documents ?? []} onChanged={refresh} />

          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="gap-1 p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Documents
              </div>
              <div className="font-mono text-3xl">{stats.documents?.length ?? 0}</div>
            </Card>
            <Card className="gap-1 p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Searchable chunks
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
        </div>
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
