"""Document upload: turn an uploaded file into searchable chunks.

Reuses the same chunk → embed → upsert pipeline as CLI ingest, so an uploaded
document is indexed exactly the way a committed one is. Extraction is limited
to formats we can read losslessly as text; anything else is rejected with a
clear reason rather than indexed as garbage.
"""
from __future__ import annotations

import io

from app.retrieval.chunking import chunk_document
from app.retrieval.embeddings import embed_texts
from app.retrieval.pinecone_store import PineconeStore

TEXT_SUFFIXES = {".md", ".txt", ".markdown", ".rst", ".csv", ".json", ".py", ".ts", ".tsx"}
MAX_BYTES = 2 * 1024 * 1024  # 2MB — free-tier embedding quota is the real limit


class DocumentError(Exception):
    """Raised when a document cannot be accepted or extracted."""


def extract_text(filename: str, raw: bytes) -> str:
    """Return the document's text, or explain why it can't be extracted."""
    if len(raw) > MAX_BYTES:
        raise DocumentError(
            f"file is {len(raw) // 1024}KB; the limit is {MAX_BYTES // 1024}KB"
        )

    lower = filename.lower()
    suffix = lower[lower.rfind(".") :] if "." in lower else ""

    if suffix == ".pdf":
        try:
            from pypdf import PdfReader
        except ImportError as e:  # pragma: no cover - dependency is declared
            raise DocumentError("PDF support unavailable on this deployment") from e
        try:
            reader = PdfReader(io.BytesIO(raw))
            text = "\n\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception as e:  # noqa: BLE001 — malformed PDFs are user error
            raise DocumentError(f"could not read PDF: {type(e).__name__}") from e
        if not text.strip():
            raise DocumentError(
                "no selectable text found — this looks like a scanned PDF, "
                "which needs OCR this deployment does not run"
            )
        return text

    if suffix in TEXT_SUFFIXES:
        try:
            return raw.decode("utf-8")
        except UnicodeDecodeError:
            return raw.decode("latin-1", errors="replace")

    raise DocumentError(
        f"unsupported file type '{suffix or 'unknown'}'; "
        f"accepted: pdf, {', '.join(sorted(s.lstrip('.') for s in TEXT_SUFFIXES))}"
    )


def ingest_document(
    filename: str, raw: bytes, store: PineconeStore | None = None, embed=embed_texts
) -> dict:
    """Chunk, embed and index one uploaded document."""
    text = extract_text(filename, raw)
    chunks = chunk_document(filename, text)
    if not chunks:
        raise DocumentError("document contained no readable text")

    store = store or PineconeStore()
    # Re-uploading replaces the old version rather than leaving orphan chunks
    # behind: chunk ids are positional, so a shorter revision would strand them.
    store.delete_document(filename)
    vectors = embed([c["text"] for c in chunks])
    store.upsert_chunks(chunks, vectors)
    return {"doc": filename, "chunks": len(chunks), "characters": len(text)}
