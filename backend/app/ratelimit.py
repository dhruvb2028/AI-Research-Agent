"""Client-side rate limiting for the LLM endpoint.

NIM's free tier enforces ~40 req/min server-side; we self-limit below that so a
multi-step agent run never trips the server limit in the first place. Sliding
window over call timestamps; clock/sleep are injectable for deterministic tests.
"""
from __future__ import annotations

import time
from collections import deque


class RateLimiter:
    def __init__(self, max_per_minute: int, clock=time.monotonic, sleeper=time.sleep):
        self.max_per_minute = max_per_minute
        self._clock = clock
        self._sleep = sleeper
        self._calls: deque[float] = deque()

    def acquire(self) -> float:
        """Block until a call slot is free. Returns seconds waited."""
        waited = 0.0
        while True:
            now = self._clock()
            while self._calls and now - self._calls[0] >= 60:
                self._calls.popleft()
            if len(self._calls) < self.max_per_minute:
                self._calls.append(now)
                return waited
            wait = 60 - (now - self._calls[0])
            waited += wait
            self._sleep(wait)
