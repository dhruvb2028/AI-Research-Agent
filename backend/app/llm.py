"""Thin LLM client over any OpenAI-compatible endpoint (NIM primary)."""
from __future__ import annotations

import time

from openai import APIConnectionError, InternalServerError, OpenAI, RateLimitError

from app.config import NIM_API_KEY, NIM_BASE_URL, NIM_MAX_REQUESTS_PER_MINUTE
from app.ratelimit import RateLimiter

RETRYABLE = (RateLimitError, APIConnectionError, InternalServerError)
MAX_ATTEMPTS = 4
BACKOFF_BASE_S = 2.0


class LLMClient:
    """Wraps chat completions so the rest of the app never touches the SDK directly.

    Injectable in tests; provider swaps are a base_url/key change. If a tracer is
    attached, every call is logged with latency, token usage, and would-be cost.
    Calls are rate-limited client-side and retried with exponential backoff on
    429s, connection failures, and 5xxs.
    """

    def __init__(
        self,
        base_url: str = NIM_BASE_URL,
        api_key: str = NIM_API_KEY,
        tracer=None,
        limiter: RateLimiter | None = None,
        sleeper=time.sleep,
    ):
        self._client = OpenAI(base_url=base_url, api_key=api_key)
        self.tracer = tracer
        self._limiter = limiter or RateLimiter(NIM_MAX_REQUESTS_PER_MINUTE)
        self._sleep = sleeper

    def chat(
        self,
        model: str,
        messages: list[dict],
        tools: list[dict] | None = None,
        temperature: float = 0.2,
        max_tokens: int = 1024,
    ):
        """Return the assistant message from one chat completion."""
        kwargs: dict = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if tools:
            kwargs["tools"] = tools

        start = time.time()
        resp = self._create_with_retry(kwargs)
        latency = time.time() - start

        if self.tracer is not None:
            usage = resp.usage
            self.tracer.llm_call(
                model=model,
                latency_s=latency,
                prompt_tokens=getattr(usage, "prompt_tokens", 0) or 0,
                completion_tokens=getattr(usage, "completion_tokens", 0) or 0,
            )
        return resp.choices[0].message

    def _create_with_retry(self, kwargs: dict):
        for attempt in range(1, MAX_ATTEMPTS + 1):
            self._limiter.acquire()
            try:
                return self._client.chat.completions.create(**kwargs)
            except RETRYABLE as e:
                if attempt == MAX_ATTEMPTS:
                    raise
                delay = BACKOFF_BASE_S * 2 ** (attempt - 1)
                if self.tracer is not None:
                    self.tracer.event(
                        "llm_retry", attempt=attempt, delay_s=delay, error=type(e).__name__
                    )
                self._sleep(delay)
