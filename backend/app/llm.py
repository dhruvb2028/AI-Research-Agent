"""Thin LLM client over any OpenAI-compatible endpoint (NIM primary)."""
from __future__ import annotations

import time

from openai import OpenAI

from app.config import NIM_API_KEY, NIM_BASE_URL


class LLMClient:
    """Wraps chat completions so the rest of the app never touches the SDK directly.

    Injectable in tests; provider swaps are a base_url/key change. If a tracer is
    attached, every call is logged with latency, token usage, and would-be cost.
    """

    def __init__(self, base_url: str = NIM_BASE_URL, api_key: str = NIM_API_KEY, tracer=None):
        self._client = OpenAI(base_url=base_url, api_key=api_key)
        self.tracer = tracer

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
        resp = self._client.chat.completions.create(**kwargs)
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
