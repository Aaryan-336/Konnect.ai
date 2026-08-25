# LLM package
from app.llm.provider import LLMProvider
from app.llm.openai_provider import OpenAIProvider
from app.llm.groq_provider import GroqProvider
from app.config import get_settings


def get_llm_provider() -> LLMProvider:
    """Factory function to instantiate the configured LLM provider."""
    settings = get_settings()
    if settings.llm_provider.lower() == "groq":
        return GroqProvider()
    return OpenAIProvider()


__all__ = ["LLMProvider", "OpenAIProvider", "GroqProvider", "get_llm_provider"]
