"""
Groq LLM provider — ultra-low latency inference via Groq API.
Compatible with Llama 3.3 70B, Llama 3.1, Mixtral, and Gemma models.
"""

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


class GroqProvider(LLMProvider):
    """Groq LLM provider using OpenAI-compatible API."""

    def __init__(self):
        settings = get_settings()
        api_key = settings.groq_api_key or settings.openai_api_key
        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url=settings.groq_base_url,
        )
        self.model = settings.groq_model
        self.default_max_tokens = settings.openai_max_tokens
        # gpt-oss models spend part of max_tokens on hidden reasoning before
        # emitting anything. Left at the default that routinely consumed the
        # entire budget on short structured calls, returning an empty string.
        # "low" keeps enough reasoning for the task while leaving room for the
        # actual answer, and cuts tokens billed per request.
        self.reasoning_effort = (
            settings.groq_reasoning_effort
            if "gpt-oss" in (self.model or "")
            else None
        )

    async def generate(
        self,
        messages: list[dict],
        temperature: float = 0.1,
        max_tokens: int = 4096,
        response_format: dict | None = None,
    ) -> str:
        kwargs = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format:
            kwargs["response_format"] = response_format
        if self.reasoning_effort:
            kwargs["reasoning_effort"] = self.reasoning_effort

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
            **({"reasoning_effort": self.reasoning_effort} if self.reasoning_effort else {}),
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
        return f"groq/{self.model}"
