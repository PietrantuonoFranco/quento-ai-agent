"""In-memory conversation state per phone number, plus message deduplication."""

import asyncio
import time
from collections.abc import Callable

from google.genai import types

MAX_MESSAGES = 40
CONVERSATION_TTL = 24 * 3600
SEEN_TTL = 24 * 3600


class ConversationStore:
    """Keeps the last `max_messages` history entries per phone; a conversation idle for `ttl` seconds is forgotten."""

    def __init__(
        self,
        max_messages: int = MAX_MESSAGES,
        ttl: float = CONVERSATION_TTL,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._max = max_messages
        self._ttl = ttl
        self._clock = clock
        self._data: dict[str, tuple[float, list[types.Content]]] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    def get(self, phone: str) -> list[types.Content]:
        """A copy of the history, so a failed turn never leaves it half written."""
        entry = self._data.get(phone)
        if entry is None:
            return []
        if self._clock() - entry[0] > self._ttl:
            del self._data[phone]
            return []
        return list(entry[1])

    def save(self, phone: str, history: list[types.Content]) -> None:
        self._data[phone] = (self._clock(), _trim(history, self._max))

    def lock(self, phone: str) -> asyncio.Lock:
        """Serializes the messages of one customer so their turns don't interleave."""
        return self._locks.setdefault(phone, asyncio.Lock())


def _trim(history: list[types.Content], limit: int) -> list[types.Content]:
    trimmed = history[-limit:]
    # Start at a real user message: a tool result or model turn without its counterpart is invalid for Gemini.
    start = 0
    while start < len(trimmed) and not _is_user_text(trimmed[start]):
        start += 1
    return trimmed[start:]


def _is_user_text(content: types.Content) -> bool:
    return content.role == "user" and all(p.function_response is None for p in content.parts or [])


class SeenMessages:
    """Meta retries webhooks: remembers message ids so each one is processed once."""

    def __init__(self, ttl: float = SEEN_TTL, clock: Callable[[], float] = time.monotonic) -> None:
        self._ttl = ttl
        self._clock = clock
        self._seen: dict[str, float] = {}

    def add(self, message_id: str) -> bool:
        """True if the id is new, False if it was already seen."""
        now = self._clock()
        self._seen = {k: t for k, t in self._seen.items() if now - t <= self._ttl}
        if message_id in self._seen:
            return False
        self._seen[message_id] = now
        return True
