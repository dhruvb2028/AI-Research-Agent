"""Thin LLM client over any OpenAI-compatible endpoint (NIM primary)."""
from __future__ import annotations

from openai import OpenAI

from app.config import NIM_API_KEY, NIM_BASE_URL


class LLMClient:
    """Wraps chat completions so the rest of the app never touches the SDK directly.

    Injectable in tests; provider swaps are a base_url/key change.
    """

    def __init__(self, base_url: str = NIM_BASE_URL, api_key: str = NIM_API_KEY):
        self._client = OpenAI(base_url=base_url, api_key=api_key)

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
        resp = self._client.chat.completions.create(**kwargs)
        return resp.choices[0].message
