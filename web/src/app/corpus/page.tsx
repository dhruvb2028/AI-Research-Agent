"use client";

import { CircleAlert, Database } from "lucide-react";
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
        <h1 className="text-xl font-semibold tracking-tight">Private corpus</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
          Documents the agent can search that the public web does not have. Retrieval
          embeds the query, fetches nearest chunks from the vector index, then reranks
          them with a hosted cross-encoder before the model sees anything.
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
            <div className="text-sm font-medium">Corpus index unavailable</div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{stats.error}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Web search still works — the agent degrades to web-only rather than
              failing the run.
            </p>
          </div>
        </Card>
      )}

      {stats?.available && (
        <div className="grid gap-3 sm:grid-cols-3">
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
              Matryoshka-truncated from 3072 to fit free-tier storage
            </p>
          </Card>
          <Card className="gap-1 p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Index
            </div>
            <div className="truncate font-mono text-lg">{stats.index}</div>
            <p className="text-xs text-muted-foreground">Pinecone serverless</p>
          </Card>
        </div>
      )}

      {config && (
        <Card className="mt-4 gap-3 p-4">
          <div className="flex items-center gap-2">
            <Database className="size-4 text-primary" />
            <h2 className="text-sm font-medium">Retrieval pipeline</h2>
          </div>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">1. Embed</span> — the
              sub-question is embedded with Google&apos;s gemini-embedding-001, truncated
              to {stats?.dimension ?? config.retrieval.top_k} dimensions and
              re-normalised.
            </li>
            <li>
              <span className="font-medium text-foreground">2. Vector search</span> —
              top {config.retrieval.top_k} nearest chunks by cosine similarity from the
              serverless index.
            </li>
            <li>
              <span className="font-medium text-foreground">3. Rerank</span> — a hosted
              cross-encoder rescores those candidates jointly against the query and keeps
              the top {config.retrieval.top_n}. If the rerank quota is exhausted it falls
              back to a second provider, then to no reranking at all — a run never fails
              because a quality enhancer is unavailable.
            </li>
          </ol>
          <p className="text-xs text-muted-foreground">
            Ingestion is idempotent: chunks are hashed, so re-running it only embeds
            content that actually changed.
          </p>
        </Card>
      )}
    </div>
  );
}
