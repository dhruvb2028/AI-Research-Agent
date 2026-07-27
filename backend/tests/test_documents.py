"""Document upload: extraction rules and ingest wiring — no network."""
import pytest

from app.documents import MAX_BYTES, DocumentError, extract_text, ingest_document


class FakeStore:
    def __init__(self):
        self.deleted: list[str] = []
        self.upserted: list[dict] = []

    def delete_document(self, doc):
        self.deleted.append(doc)
        return 0

    def upsert_chunks(self, chunks, vectors):
        self.upserted = chunks
        return len(chunks)


def _embed(texts):
    return [[0.1] * 8 for _ in texts]


def test_extract_text_from_markdown():
    assert extract_text("notes.md", b"# Title\n\nBody text.") == "# Title\n\nBody text."


def test_extract_falls_back_on_bad_utf8():
    assert "caf" in extract_text("notes.txt", "café".encode("latin-1"))


def test_rejects_unsupported_type():
    with pytest.raises(DocumentError, match="unsupported file type"):
        extract_text("photo.png", b"\x89PNG")


def test_rejects_oversized_file():
    with pytest.raises(DocumentError, match="limit is"):
        extract_text("big.md", b"x" * (MAX_BYTES + 1))


def test_scanned_pdf_reports_missing_text():
    pytest.importorskip("pypdf")
    from pypdf import PdfWriter

    import io

    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    with pytest.raises(DocumentError, match="scanned PDF|no selectable text"):
        extract_text("scan.pdf", buf.getvalue())


def test_ingest_chunks_embeds_and_replaces():
    store = FakeStore()
    result = ingest_document("doc.md", b"para one. " * 400, store=store, embed=_embed)
    assert result["doc"] == "doc.md"
    assert result["chunks"] > 1
    # Re-upload must clear the previous version first, not leave orphan chunks.
    assert store.deleted == ["doc.md"]
    assert store.upserted[0]["id"] == "doc.md::chunk0"


def test_ingest_rejects_empty_document():
    with pytest.raises(DocumentError, match="no readable text"):
        ingest_document("empty.md", b"   ", store=FakeStore(), embed=_embed)
