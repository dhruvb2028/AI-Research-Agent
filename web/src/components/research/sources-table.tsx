"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { citedIndices, hostOf, isCorpus, type Evidence } from "@/lib/api";

/**
 * Columns are limited to facts the pipeline records. There is deliberately no
 * "credibility" column: nothing in the system measures source credibility, so
 * showing one would be invented.
 */
export function SourcesTable({
  evidence,
  answer,
  onSelect,
  selectedUrl,
}: {
  evidence: Evidence[];
  answer: string;
  onSelect: (index: number) => void;
  selectedUrl?: string;
}) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [usage, setUsage] = useState("all");
  const cited = useMemo(() => citedIndices(answer), [answer]);

  const rows = evidence
    .map((e, i) => ({ e, n: i + 1 }))
    .filter(({ e, n }) => {
      if (q && !`${e.title} ${e.url} ${e.query ?? ""}`.toLowerCase().includes(q.toLowerCase()))
        return false;
      if (type === "web" && isCorpus(e)) return false;
      if (type === "corpus" && !isCorpus(e)) return false;
      if (usage === "cited" && !cited.has(n)) return false;
      if (usage === "uncited" && cited.has(n)) return false;
      return true;
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter sources…"
            className="h-9 bg-background pl-8"
            aria-label="Filter sources"
          />
        </div>
        <Select value={type} onValueChange={(v) => setType(v ?? "all")}>
          <SelectTrigger className="h-9 w-[150px] bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="web">Web</SelectItem>
            <SelectItem value="corpus">Project docs</SelectItem>
          </SelectContent>
        </Select>
        <Select value={usage} onValueChange={(v) => setUsage(v ?? "all")}>
          <SelectTrigger className="h-9 w-[150px] bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="cited">Cited</SelectItem>
            <SelectItem value="uncited">Not cited</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">#</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="hidden md:table-cell">Provider</TableHead>
              <TableHead className="hidden lg:table-cell">Retrieved by</TableHead>
              <TableHead className="w-24 text-right">Relevance</TableHead>
              <TableHead className="w-24">Used</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                  No sources match these filters.
                </TableCell>
              </TableRow>
            )}
            {rows.map(({ e, n }) => (
              <TableRow
                key={e.url}
                onClick={() => onSelect(n)}
                className={cn(
                  "cursor-pointer",
                  selectedUrl === e.url && "bg-accent/60 hover:bg-accent/60",
                )}
              >
                <TableCell className="font-mono text-xs text-muted-foreground">{n}</TableCell>
                <TableCell className="max-w-[280px]">
                  <div className="truncate text-sm font-medium">{e.title || hostOf(e.url)}</div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">
                    {hostOf(e.url)}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <Badge variant="secondary" className="font-mono text-[10px] font-normal">
                    {e.source}
                  </Badge>
                </TableCell>
                <TableCell className="hidden max-w-[220px] truncate font-mono text-xs text-muted-foreground lg:table-cell">
                  {e.query ?? "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {typeof e.score === "number" ? (
                    e.score.toFixed(3)
                  ) : (
                    <span
                      className="text-muted-foreground"
                      title="This provider does not return a relevance score"
                    >
                      —
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {cited.has(n) ? (
                    <Badge className="bg-[var(--success)]/10 text-[var(--success)] hover:bg-[var(--success)]/10">
                      cited
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      not cited
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Relevance is the provider&apos;s own score — Tavily&apos;s ranking score or the
        document-index cosine similarity. Serper returns SERP rank rather than a score, shown
        as &ldquo;—&rdquo; rather than converted into one.
      </p>
    </div>
  );
}
