"use client";

import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { deleteDocument, uploadDocument, type CorpusStats } from "@/lib/api";

const ACCEPT = ".pdf,.md,.txt,.markdown,.rst,.csv,.json,.py,.ts,.tsx";

export function DocumentManager({
  documents,
  onChanged,
}: {
  documents: NonNullable<CorpusStats["documents"]>;
  onChanged: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      setBusy(file.name);
      try {
        const r = await uploadDocument(file);
        toast.success(`Indexed ${r.doc}`, {
          description: `${r.chunks} chunks from ${r.characters.toLocaleString()} characters`,
        });
      } catch (e) {
        toast.error(`Could not index ${file.name}`, {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    }
    setBusy(null);
    onChanged();
  };

  const remove = async (doc: string) => {
    setBusy(doc);
    try {
      await deleteDocument(doc);
      toast.success(`Removed ${doc}`);
    } catch (e) {
      toast.error(`Could not remove ${doc}`, {
        description: e instanceof Error ? e.message : String(e),
      });
    }
    setBusy(null);
    onChanged();
  };

  return (
    <Card className="gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Documents</h2>
        <span className="text-xs text-muted-foreground">
          {documents.length} indexed
        </span>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed p-6 text-center transition-colors",
          dragging ? "border-primary bg-accent" : "hover:border-primary/50 hover:bg-muted/50",
        )}
      >
        {busy && !documents.some((d) => d.doc === busy) ? (
          <>
            <Loader2 className="size-5 animate-spin text-primary" />
            <p className="text-sm">Indexing {busy}…</p>
            <p className="text-xs text-muted-foreground">
              Chunking, embedding, and upserting to the vector index
            </p>
          </>
        ) : (
          <>
            <Upload className="size-5 text-muted-foreground" />
            <p className="text-sm">
              Drop files here or <span className="text-primary">browse</span>
            </p>
            <p className="text-xs text-muted-foreground">
              PDF, Markdown, or plain text · up to 2MB each
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            upload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {documents.length === 0 ? (
        <p className="py-2 text-center text-sm text-muted-foreground">
          No documents indexed yet. Upload one, then enable
          <span className="mx-1 font-medium text-foreground">Your documents</span>
          on the Research page to search it.
        </p>
      ) : (
        <div className="divide-y">
          {documents.map((d) => (
            <div key={d.doc} className="flex items-center gap-3 py-2.5">
              <FileText className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate font-mono text-sm">{d.doc}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {d.chunks} chunk{d.chunks === 1 ? "" : "s"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove ${d.doc}`}
                disabled={busy === d.doc}
                onClick={() => remove(d.doc)}
                className="text-muted-foreground hover:text-destructive"
              >
                {busy === d.doc ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
