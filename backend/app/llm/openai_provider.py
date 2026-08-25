"""OpenAI LLM provider."""

import json
from typing import AsyncIterator

from openai import AsyncOpenAI, APIStatusError, RateLimitError

from app.llm.provider import LLMProvider, LLMError, LLMRateLimitError
from app.config import get_settings


def _wrap_error(exc: Exception) -> Exception:
    """Translate provider SDK errors into the pipeline's error vocabulary."""
    if isinstance(exc, (RateLimitError, APIStatusError)):
        status = getattr(exc, "status_code", None)
        if status in (413, 429) or isinstance(exc, RateLimitError):
            return LLMRateLimitError(str(exc))
    return LLMError(str(exc))


class OpenAIProvider(LLMProvider):
    """OpenAI-compatible LLM provider (GPT-4o, etc.)."""

    def __init__(self):
        settings = get_settings()
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.model = settings.openai_model
        self.default_max_tokens = settings.openai_max_tokens

    async def generate(
        self, messages: list[dict], temperature: float = 0.1,
        max_tokens: int = 4096, response_format: dict | None = None,
    ) -> str:
        kwargs = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format:
            kwargs["response_format"] = response_format

        try:
            response = await self.client.chat.completions.create(**kwargs)
        except Exception as e:
            raise _wrap_error(e) from e

        return response.choices[0].message.content or ""

    async def generate_stream(
        self,
        messages: list[dict],
        temperature: float = 0.1,
        max_tokens: int = 4096,
        response_format: dict | None = None,
    ) -> AsyncIterator[str]:
        kwargs = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }
        if response_format:
            kwargs["response_format"] = response_format

        try:
            stream = await self.client.chat.completions.create(**kwargs)
        except Exception as e:
            raise _wrap_error(e) from e

        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    def model_name(self) -> str:
        return self.model
