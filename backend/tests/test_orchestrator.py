"""Unit tests for the agent loop — LLM and search fully mocked, no network."""
from types import SimpleNamespace

from app.agent.orchestrator import MAX_STEPS, AgentResult, run_agent
from app.tools.search_tavily import SearchError


def _msg(content=None, tool_calls=None):
    return SimpleNamespace(content=content, tool_calls=tool_calls)


def _tool_call(query: str, call_id: str = "call_1"):
    return SimpleNamespace(
        id=call_id,
        function=SimpleNamespace(name="search_web", arguments=f'{{"query": "{query}"}}'),
    )


class FakeLLM:
    """Yields scripted messages in order; records every chat() invocation."""

    def __init__(self, script):
        self.script = list(script)
        self.calls = []

    def chat(self, **kwargs):
        self.calls.append(kwargs)
        return self.script.pop(0)


def fake_search(query):
    return [{"url": f"https://example.com/{query}", "title": f"About {query}", "snippet": "facts", "source": "test"}]


def test_direct_answer_no_tools():
    llm = FakeLLM([_msg(content="Paris is the capital of France.")])
    result = run_agent("capital of France?", llm=llm, search=fake_search)
    assert result.answer == "Paris is the capital of France."
    assert result.steps == 1
    assert result.evidence == []


def test_search_then_answer_collects_evidence():
    llm = FakeLLM(
        [
            _msg(tool_calls=[_tool_call("population of bangalore")]),
            _msg(content="About 14 million [1]."),
        ]
    )
    result = run_agent("population of bangalore?", llm=llm, search=fake_search)
    assert "[1]" in result.answer
    assert len(result.evidence) == 1
    assert result.evidence[0]["query"] == "population of bangalore"
    # tool result was fed back to the model on the second call
    roles = [m["role"] for m in llm.calls[1]["messages"]]
    assert "tool" in roles


def test_budget_exhaustion_forces_synthesis():
    searching = [_msg(tool_calls=[_tool_call(f"q{i}", f"call_{i}")]) for i in range(MAX_STEPS)]
    llm = FakeLLM(searching + [_msg(content="Partial answer.")])
    result = run_agent("hard question", llm=llm, search=fake_search)
    assert result.budget_exhausted
    assert result.steps == MAX_STEPS
    assert result.answer == "Partial answer."
    assert len(result.evidence) == MAX_STEPS


def test_search_failure_is_fed_back_not_raised():
    def failing_search(query):
        raise SearchError("provider down")

    llm = FakeLLM(
        [
            _msg(tool_calls=[_tool_call("anything")]),
            _msg(content="I could not retrieve sources."),
        ]
    )
    result = run_agent("q", llm=llm, search=failing_search)
    tool_msgs = [m for m in llm.calls[1]["messages"] if m["role"] == "tool"]
    assert "error: search failed" in tool_msgs[0]["content"]
    assert isinstance(result, AgentResult)


def test_malformed_tool_args_are_fed_back():
    bad_call = SimpleNamespace(
        id="call_1",
        function=SimpleNamespace(name="search_web", arguments="not json"),
    )
    llm = FakeLLM([_msg(tool_calls=[bad_call]), _msg(content="done")])
    run_agent("q", llm=llm, search=fake_search)
    tool_msgs = [m for m in llm.calls[1]["messages"] if m["role"] == "tool"]
    assert "malformed tool arguments" in tool_msgs[0]["content"]
