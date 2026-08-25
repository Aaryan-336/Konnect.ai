"""
Abstract LLM provider interface.

Concrete implementations:
- OpenAIProvider ← MVP default
"""

from abc import ABC, abstractmethod
from typing import AsyncIterator


class LLMError(Exception):
    """Generation failed for a reason the caller should surface, not retry blindly."""


class LLMRateLimitError(LLMError):
    """
    Provider rejected the request on quota or token-per-minute limits.

    Worth distinguishing from a generic failure: the answer is recoverable by
    waiting or by shrinking the request, and the user deserves to be told which.
    """


class LLMProvider(ABC):
    """Base class for LLM providers."""

    @abstractmethod
    async def generate(
        self, messages: list[dict], temperature: float = 0.1,
        max_tokens: int = 4096, response_format: dict | None = None,
    ) -> str:
        """Generate a response. Returns complete text."""
        ...

    @abstractmethod
    async def generate_stream(
        self, messages: list[dict], temperature: float = 0.1,
        max_tokens: int = 4096, response_format: dict | None = None,
    ) -> AsyncIterator[str]:
        """Generate a streaming response. Yields raw token deltas."""
        ...

    @abstractmethod
    def model_name(self) -> str:
        """Return model identifier."""
        ...
