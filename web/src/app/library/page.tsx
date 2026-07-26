"use client";

import { CircleAlert, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getRuns, type RunSummary } from "@/lib/api";

function when(ts: number) {
  const d = new Date(ts * 1000);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LibraryPage() {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getRuns()
      .then(setRuns)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Library</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Every research run this deployment has executed, reconstructed from the JSONL
          trace each run writes. No database — the logs are the source of truth.
        </p>
      </header>

      {error && (
        <Card className="flex-row items-center gap-2 border-destructive/40 bg-destructive/5 p-4 text-sm">
          <CircleAlert className="size-4 text-destructive" />
          Could not load runs: <span className="font-mono text-xs">{error}</span>
        </Card>
      )}

      {!runs && !error && (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {runs && runs.length === 0 && (
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No runs recorded yet. Start one from the Research tab.
          </p>
        </Card>
      )}

      {runs && runs.length > 0 && (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Question</TableHead>
                <TableHead className="hidden sm:table-cell">Started</TableHead>
                <TableHead className="w-20 text-right">Time</TableHead>
                <TableHead className="hidden w-20 text-right md:table-cell">Steps</TableHead>
                <TableHead className="hidden w-20 text-right md:table-cell">Tools</TableHead>
                <TableHead className="hidden w-24 text-right lg:table-cell">Cost*</TableHead>
                <TableHead className="w-28">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.run_id}>
                  <TableCell className="max-w-[320px]">
                    <div className="truncate text-sm">{r.question || "—"}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {r.run_id}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                    {when(r.started_at)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {r.duration_s}s
                  </TableCell>
                  <TableCell className="hidden text-right font-mono text-xs md:table-cell">
                    {r.steps ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-right font-mono text-xs md:table-cell">
                    {r.tool_calls}
                  </TableCell>
                  <TableCell className="hidden text-right font-mono text-xs lg:table-cell">
                    {r.est_cost_usd != null ? `$${r.est_cost_usd.toFixed(4)}` : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {!r.completed ? (
                        <Badge variant="outline" className="text-muted-foreground">
                          incomplete
                        </Badge>
                      ) : r.budget_exhausted ? (
                        <Badge className="gap-1 bg-[var(--warning)]/10 text-[var(--warning)] hover:bg-[var(--warning)]/10">
                          <TriangleAlert className="size-3" /> budget
                        </Badge>
                      ) : (
                        <Badge className="bg-[var(--success)]/10 text-[var(--success)] hover:bg-[var(--success)]/10">
                          done
                        </Badge>
                      )}
                      {r.retries > 0 && (
                        <Badge
                          variant="outline"
                          className="gap-1 text-muted-foreground"
                          title={`${r.retries} provider error(s) retried`}
                        >
                          <RotateCcw className="size-3" />
                          {r.retries}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        * Cost the run would have incurred at paid-host token rates. Actual spend is $0 —
        every provider is on a free tier.
      </p>
    </div>
  );
}
