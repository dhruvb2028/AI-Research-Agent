"""Fixed-size chunking with overlap.

Fixed-size was chosen over semantic chunking for v1 deliberately: it is
predictable, cheap, and its recall cost is measurable in the eval harness —
the A/B against semantic chunking is a planned experiment, not an assumption.
"""
from __future__ import annotations

from pathlib import Path

CHUNK_CHARS = 1200
OVERLAP_CHARS = 200


def chunk_text(text: str, chunk_chars: int = CHUNK_CHARS, overlap: int = OVERLAP_CHARS) -> list[str]:
    text = text.strip()
    if not text:
        return []
    if len(text) <= chunk_chars:
        return [text]
    chunks, start = [], 0
    step = chunk_chars - overlap
    while start < len(text):
        end = min(start + chunk_chars, len(text))
        # Prefer to break on a paragraph or sentence boundary near the end.
        window = text[start:end]
        if end < len(text):
            for sep in ("\n\n", ". ", "\n"):
                cut = window.rfind(sep)
                if cut > chunk_chars // 2:
                    window = window[: cut + len(sep)]
                    end = start + len(window)
                    break
        chunks.append(window.strip())
        start = end - overlap if end < len(text) else len(text)
    return [c for c in chunks if c]


def chunk_file(path: Path) -> list[dict]:
    """Chunk one text/markdown file into records with stable ids."""
    text = path.read_text(encoding="utf-8", errors="replace")
    return [
        {"id": f"{path.name}::chunk{i}", "doc": path.name, "chunk_index": i, "text": c}
        for i, c in enumerate(chunk_text(text))
    ]
