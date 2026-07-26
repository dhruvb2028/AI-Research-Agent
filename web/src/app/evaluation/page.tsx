"use client";

import { CircleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getEvals, type EvalReport } from "@/lib/api";

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

export default function EvaluationPage() {
  const [reports, setReports] = useState<EvalReport[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getEvals()
      .then(setReports)
      .catch((e) => setError(String(e)));
  }, []);

  const latest = reports?.find((r) => r.scored > 5) ?? reports?.[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Evaluation</h1>
        <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">
          The agent is measured against a hand-labelled question set covering factual,
          multi-hop, adversarial and corpus-only questions. An LLM judge from a
          different model family than the agent grades correctness against a per-item
          rubric and checks whether cited evidence actually supports each claim.
        </p>
      </header>

      {error && (
        <Card className="flex-row items-center gap-2 border-destructive/40 bg-destructive/5 p-4 text-sm">
          <CircleAlert className="size-4 text-destructive" />
          Could not load reports: <span className="font-mono text-xs">{error}</span>
        </Card>
      )}

      {!reports && !error && (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {latest && (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <Card className="gap-2 p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Answer correctness
            </div>
            <div className="font-mono text-3xl">{pct(latest.correctness_pass)}</div>
            <Progress value={(latest.correctness_pass ?? 0) * 100} className="h-1.5" />
            <p className="text-xs text-muted-foreground">
              {latest.scored} scored items, latest full run
            </p>
          </Card>
          <Card className="gap-2 p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Citation faithfulness
            </div>
            <div className="font-mono text-3xl">{pct(latest.faithfulness_pass)}</div>
            <Progress value={(latest.faithfulness_pass ?? 0) * 100} className="h-1.5" />
            <p className="text-xs text-muted-foreground">
              Does the cited source actually support the claim
            </p>
          </Card>
          <Card className="gap-2 p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Dangling citations
            </div>
            <div className="font-mono text-3xl">{latest.dangling_citation_items}</div>
            <p className="text-xs text-muted-foreground">
              Answers citing evidence that does not exist — checked
              deterministically, without the judge
            </p>
          </Card>
        </div>
      )}

      {reports && reports.length > 0 && (
        <>
          <h2 className="mb-2 text-sm font-medium">Report history</h2>
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Report</TableHead>
                  <TableHead className="hidden md:table-cell">Commit</TableHead>
                  <TableHead className="w-20 text-right">Items</TableHead>
                  <TableHead className="w-24 text-right">Correct</TableHead>
                  <TableHead className="w-28 text-right">Faithful</TableHead>
                  <TableHead className="hidden w-24 text-right sm:table-cell">
                    Avg time
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="text-sm font-medium">{r.label}</div>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {r.categories.map((c) => (
                          <Badge
                            key={c}
                            variant="secondary"
                            className="text-[10px] font-normal"
                          >
                            {c}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                      {r.git_sha}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {r.scored}/{r.items}
                      {r.errors > 0 && (
                        <span className="ml-1 text-muted-foreground">
                          ({r.errors} err)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {pct(r.correctness_pass)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {pct(r.faithfulness_pass)}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono text-xs sm:table-cell">
                      {r.avg_latency_s != null ? `${r.avg_latency_s}s` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Card className="mt-4 gap-2 p-4">
            <h3 className="text-sm font-medium">How to read these numbers</h3>
            <p className="text-sm text-muted-foreground">
              A high pass rate on a 30-question set is a regression guard, not proof of
              general correctness — it means the set&apos;s difficulty ceiling sits below
              the agent&apos;s current ability. The set is being hardened with obscure
              multi-hop chains and recency-sensitive questions to create headroom. Each
              report is stamped with the commit it ran against, so any change in these
              numbers is attributable to a specific change in the agent.
            </p>
          </Card>
        </>
      )}

      {reports && reports.length === 0 && (
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No eval reports found. Run the harness to generate one.
          </p>
        </Card>
      )}
    </div>
  );
}
