"""Tests for the client-side rate limiter and LLM retry/backoff — no network."""
import httpx
import pytest
from openai import RateLimitError

from app.llm import MAX_ATTEMPTS, LLMClient
from app.ratelimit import RateLimiter


def _rate_limit_error():
    req = httpx.Request("POST", "https://x/v1/chat/completions")
    return RateLimitError(
        "rate limited", response=httpx.Response(429, request=req), body=None
    )


class FakeClock:
    def __init__(self):
        self.now = 0.0
        self.slept = []

    def __call__(self):
        return self.now

    def sleep(self, s):
        self.slept.append(s)
        self.now += s


def test_limiter_allows_burst_up_to_cap():
    clock = FakeClock()
    rl = RateLimiter(3, clock=clock, sleeper=clock.sleep)
    for _ in range(3):
        assert rl.acquire() == 0.0
    assert clock.slept == []


def test_limiter_blocks_when_cap_hit_then_frees():
    clock = FakeClock()
    rl = RateLimiter(2, clock=clock, sleeper=clock.sleep)
    rl.acquire()
    clock.now = 10.0
    rl.acquire()
    waited = rl.acquire()  # third call must wait until the first slot ages out
    assert waited == pytest.approx(50.0)
    assert clock.now == pytest.approx(60.0)


class FlakyCompletions:
    """Fails N times with 429, then succeeds."""

    def __init__(self, failures):
        self.failures = failures
        self.calls = 0

    def create(self, **kwargs):
        self.calls += 1
        if self.calls <= self.failures:
            raise _rate_limit_error()
        import types
        msg = types.SimpleNamespace(content="ok", tool_calls=None)
        return types.SimpleNamespace(
            choices=[types.SimpleNamespace(message=msg)],
            usage=types.SimpleNamespace(prompt_tokens=1, completion_tokens=1),
        )


def _client_with(completions):
    clock = FakeClock()
    c = LLMClient(
        api_key="test",
        limiter=RateLimiter(100, clock=clock, sleeper=clock.sleep),
        sleeper=clock.sleep,
    )
    c._client.chat.completions = completions
    return c, clock


def test_retries_transient_429_then_succeeds():
    flaky = FlakyCompletions(failures=2)
    client, clock = _client_with(flaky)
    msg = client.chat(model="m", messages=[{"role": "user", "content": "hi"}])
    assert msg.content == "ok"
    assert flaky.calls == 3
    assert clock.slept == [2.0, 4.0]  # exponential backoff


def test_raises_after_max_attempts():
    flaky = FlakyCompletions(failures=MAX_ATTEMPTS)
    client, _ = _client_with(flaky)
    with pytest.raises(RateLimitError):
        client.chat(model="m", messages=[{"role": "user", "content": "hi"}])
    assert flaky.calls == MAX_ATTEMPTS
