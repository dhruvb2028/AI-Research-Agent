"""Tests for chunking, embedding cache, and corpus tool dispatch — no network."""
from types import SimpleNamespace

from app.agent.orchestrator import run_agent
from app.retrieval.chunking import chunk_file, chunk_text
from app.retrieval.embeddings import embed_texts
from tests.test_orchestrator import FakeLLM, _msg


def test_chunk_text_short_is_single_chunk():
    assert chunk_text("hello world") == ["hello world"]


def test_chunk_text_splits_with_overlap():
    text = ("A sentence about topic one. " * 30 + "\n\n" + "More on topic two. " * 30).strip()
    chunks = chunk_text(text, chunk_chars=400, overlap=100)
    assert len(chunks) > 1
    assert all(len(c) <= 400 for c in chunks)
    # Overlap: consecutive chunks share content.
    assert chunks[0][-40:] in chunks[0] and any(
        chunks[i][:50] in text for i in range(len(chunks))
    )


def test_chunk_file_stable_ids(tmp_path):
    f = tmp_path / "doc.md"
    f.write_text("content " * 400, encoding="utf-8")
    chunks = chunk_file(f)
    assert chunks[0]["id"] == "doc.md::chunk0"
    assert all(c["doc"] == "doc.md" for c in chunks)


def test_embed_cache_prevents_duplicate_api_calls(tmp_path, monkeypatch):
    import app.retrieval.embeddings as emb

    monkeypatch.setattr(emb, "CACHE_DIR", tmp_path)
    calls = []

    def fake_api(texts, dim, task_type):
        calls.append(list(texts))
        return [[1.0] + [0.0] * (dim - 1) for _ in texts]

    v1 = embed_texts(["alpha", "beta"], dim=8, _api=fake_api)
    v2 = embed_texts(["alpha", "beta", "gamma"], dim=8, _api=fake_api)
    assert len(v1) == 2 and len(v2) == 3
    # Second call only embeds the cache miss.
    assert calls == [["alpha", "beta"], ["gamma"]]


def _corpus_tool_call(query: str, call_id: str = "call_c"):
    return SimpleNamespace(
        id=call_id,
        function=SimpleNamespace(name="search_corpus", arguments=f'{{"query": "{query}"}}'),
    )


def fake_corpus(query):
    return [{"url": "corpus://notes.md#chunk0", "title": "notes.md", "snippet": "internal fact", "source": "corpus/pinecone"}]


def test_agent_dispatches_corpus_tool():
    llm = FakeLLM([_msg(tool_calls=[_corpus_tool_call("design decision")]), _msg(content="From the docs [1].")])
    result = run_agent("what did the docs decide?", llm=llm, search=None, corpus=fake_corpus)
    assert result.evidence[0]["source"] == "corpus/pinecone"
    assert result.evidence[0]["url"].startswith("corpus://")


def test_agent_reports_unknown_tool():
    bad = SimpleNamespace(id="x", function=SimpleNamespace(name="delete_files", arguments="{}"))
    llm = FakeLLM([_msg(tool_calls=[bad]), _msg(content="ok")])
    run_agent("q", llm=llm, search=fake_corpus, corpus=fake_corpus)
    tool_msgs = [m for m in llm.calls[1]["messages"] if m["role"] == "tool"]
    assert "unknown tool" in tool_msgs[0]["content"]


def test_evidence_dedup_reuses_citation_index():
    from tests.test_orchestrator import _tool_call

    def same_result(query):
        return [{"url": "https://a.com/x", "title": "t", "snippet": "s", "source": "test"}]

    llm = FakeLLM(
        [
            _msg(tool_calls=[_tool_call("q1", "c1")]),
            _msg(tool_calls=[_tool_call("q2", "c2")]),
            _msg(content="done [1]"),
        ]
    )
    result = run_agent("q", llm=llm, search=same_result, corpus=same_result)
    assert len(result.evidence) == 1  # retrieved twice, stored once
    tool_msgs = [m for m in llm.calls[2]["messages"] if m["role"] == "tool"]
    assert "[1]" in tool_msgs[-1]["content"]  # second retrieval reuses index 1
