"""
Speech-to-text providers.

Three implementations, all interchangeable behind :class:`STTProvider`:

- :class:`GroqSTTProvider`   Whisper large-v3-turbo on Groq. Free tier, no
                             local model download, and reuses the Groq key the
                             LLM pipeline already needs. This is the default.
- :class:`LocalWhisperSTTProvider`
                             faster-whisper running in-process. No API key and
                             no network at all, at the cost of a one-off model
                             download and more CPU. Use when audio must not
                             leave the host.
- :class:`OpenAISTTProvider` Hosted OpenAI Whisper. Paid.

`get_stt_provider()` picks one based on `STT_PROVIDER`, defaulting to whatever
is actually configured rather than failing on a key nobody set.
"""

from __future__ import annotations

import asyncio
import os
import tempfile
from abc import ABC, abstractmethod
from functools import lru_cache

from app.config import get_settings


class STTUnavailableError(RuntimeError):
    """No speech-to-text backend is usable with the current configuration."""


# Extensions Whisper accepts, keyed by the MIME type browsers actually send.
_EXT_BY_MIME = {
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/opus": ".opus",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/wave": ".wav",
    "audio/mp3": ".mp3",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/m4a": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/flac": ".flac",
}


def _extension_for(content_type: str) -> str:
    """
    Map a Content-Type to a file extension.

    MediaRecorder reports types like ``audio/webm;codecs=opus``, so the
    parameters have to be stripped before the lookup — matching on the full
    string silently falls through to the default and can hand Whisper a file
    whose extension contradicts its contents.
    """
    base = (content_type or "").split(";")[0].strip().lower()
    return _EXT_BY_MIME.get(base, ".webm")


def _is_usable_key(key: str | None) -> bool:
    """
    True when a key looks like a real credential.

    `.env` templates ship placeholders such as ``sk-your-key-here``. Treating
    those as configured produces a confusing 401 at request time instead of an
    honest "not configured" at startup.
    """
    if not key:
        return False
    candidate = key.strip()
    if len(candidate) < 20:
        return False
    lowered = candidate.lower()
    placeholders = ("your", "changeme", "change-me", "placeholder", "xxxx", "<", "example")
    return not any(token in lowered for token in placeholders)


class STTProvider(ABC):
    """Base class for speech-to-text providers."""

    #: Shown in logs and health output.
    name: str = "unknown"

    @abstractmethod
    async def transcribe(self, audio_data: bytes, content_type: str = "audio/webm") -> str:
        """Transcribe audio to text."""
        ...


class _WhisperAPIProvider(STTProvider):
    """
    Shared implementation for the two OpenAI-compatible Whisper endpoints.

    Both require a file handle rather than raw bytes, so the payload is written
    to a temp file whose extension matches the upload's MIME type.
    """

    def __init__(self, *, api_key: str, model: str, base_url: str | None = None):
        from openai import AsyncOpenAI

        self.client = AsyncOpenAI(
            api_key=api_key,
            **({"base_url": base_url} if base_url else {}),
        )
        self.model = model

    async def transcribe(self, audio_data: bytes, content_type: str = "audio/webm") -> str:
        suffix = _extension_for(content_type)

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
            handle.write(audio_data)
            temp_path = handle.name

        try:
            with open(temp_path, "rb") as audio_file:
                response = await self.client.audio.transcriptions.create(
                    model=self.model,
                    file=audio_file,
                )
            # Whisper prefixes a leading space on most responses.
            return (response.text or "").strip()
        finally:
            os.unlink(temp_path)


class GroqSTTProvider(_WhisperAPIProvider):
    """Whisper large-v3-turbo hosted on Groq. Free tier, OpenAI-compatible."""

    name = "groq"

    def __init__(self):
        settings = get_settings()
        if not _is_usable_key(settings.groq_api_key):
            raise STTUnavailableError("GROQ_API_KEY is not set")
        super().__init__(
            api_key=settings.groq_api_key,
            model=settings.groq_stt_model,
            base_url=settings.groq_base_url,
        )


class OpenAISTTProvider(_WhisperAPIProvider):
    """Hosted OpenAI Whisper."""

    name = "openai"

    def __init__(self):
        settings = get_settings()
        if not _is_usable_key(settings.openai_api_key):
            raise STTUnavailableError("OPENAI_API_KEY is not set")
        super().__init__(api_key=settings.openai_api_key, model=settings.stt_model)


class LocalWhisperSTTProvider(STTProvider):
    """
    faster-whisper running in this process — no API key, no network.

    The model is loaded once on first use (a few seconds, plus a one-off
    download) and reused. Transcription is CPU-bound and blocking, so it runs
    in a worker thread to keep the event loop responsive.
    """

    name = "local"

    def __init__(self):
        try:
            from faster_whisper import WhisperModel  # noqa: F401
        except ImportError as exc:
            raise STTUnavailableError(
                "faster-whisper is not installed — run: pip install 'faster-whisper>=1.0'"
            ) from exc

        settings = get_settings()
        self.model_size = settings.local_stt_model
        self.compute_type = settings.local_stt_compute_type
        self._model = None

    def _load(self):
        if self._model is None:
            from faster_whisper import WhisperModel

            self._model = WhisperModel(
                self.model_size,
                device="cpu",
                compute_type=self.compute_type,
            )
        return self._model

    def _transcribe_sync(self, path: str) -> str:
        segments, _info = self._load().transcribe(path, beam_size=5, vad_filter=True)
        return " ".join(segment.text.strip() for segment in segments).strip()

    async def transcribe(self, audio_data: bytes, content_type: str = "audio/webm") -> str:
        suffix = _extension_for(content_type)

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
            handle.write(audio_data)
            temp_path = handle.name

        try:
            return await asyncio.to_thread(self._transcribe_sync, temp_path)
        finally:
            os.unlink(temp_path)


# Tried in order when STT_PROVIDER is "auto": free and keyless options first.
_AUTO_ORDER = (
    ("groq", GroqSTTProvider),
    ("local", LocalWhisperSTTProvider),
    ("openai", OpenAISTTProvider),
)

_EXPLICIT = {
    "groq": GroqSTTProvider,
    "local": LocalWhisperSTTProvider,
    "faster-whisper": LocalWhisperSTTProvider,
    "openai": OpenAISTTProvider,
}


@lru_cache(maxsize=1)
def get_stt_provider() -> STTProvider:
    """
    Resolve the configured provider, constructing it once.

    Cached because the local backend holds a loaded model and the API backends
    hold an HTTP client; neither should be rebuilt per request.
    """
    configured = (get_settings().stt_provider or "auto").strip().lower()

    if configured in _EXPLICIT:
        # An explicit choice is not silently overridden — a misconfiguration
        # should be loud rather than quietly served by a different backend.
        return _EXPLICIT[configured]()

    if configured not in ("auto", ""):
        raise STTUnavailableError(
            f"Unknown STT_PROVIDER '{configured}' "
            f"(expected one of: auto, groq, local, openai)"
        )

    reasons: list[str] = []
    for name, factory in _AUTO_ORDER:
        try:
            return factory()
        except STTUnavailableError as exc:
            reasons.append(f"{name}: {exc}")

    raise STTUnavailableError(
        "No speech-to-text backend is configured. Set GROQ_API_KEY (free tier), "
        "or install faster-whisper for fully offline transcription. "
        "Tried — " + "; ".join(reasons)
    )
