"""Corpus ingest CLI:  python -m app.retrieval.ingest <dir-or-file> [...]

Chunks .md/.txt files, embeds (content-hash cached — unchanged chunks are
free), and upserts to Pinecone. Idempotent: stable chunk ids mean re-running
overwrites rather than duplicates.
"""
from __future__ import annotations

import sys
from pathlib import Path

from app.retrieval.chunking import chunk_file
from app.retrieval.embeddings import embed_texts
from app.retrieval.pinecone_store import PineconeStore

EXTENSIONS = {".md", ".txt"}


def collect_files(paths: list[str]) -> list[Path]:
    files: list[Path] = []
    for p in paths:
        path = Path(p)
        if path.is_dir():
            files.extend(f for f in sorted(path.rglob("*")) if f.suffix in EXTENSIONS)
        elif path.suffix in EXTENSIONS:
            files.append(path)
    return files


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("usage: python -m app.retrieval.ingest <dir-or-file> [...]")

    files = collect_files(sys.argv[1:])
    if not files:
        sys.exit("no .md/.txt files found")

    chunks: list[dict] = []
    for f in files:
        file_chunks = chunk_file(f)
        chunks.extend(file_chunks)
        print(f"  {f.name}: {len(file_chunks)} chunks")

    print(f"embedding {len(chunks)} chunks (cache hits are free)...")
    vectors = embed_texts([c["text"] for c in chunks])

    store = PineconeStore()
    n = store.upsert_chunks(chunks, vectors)
    print(f"upserted {n} chunks to Pinecone")


if __name__ == "__main__":
    main()
