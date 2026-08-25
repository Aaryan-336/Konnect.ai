"""
Abstract embedding provider interface and implementations.

Supported providers:
- FastEmbedEmbedder: local ONNX embeddings, no API key, nothing leaves the host
- OpenAIEmbedder: hosted text-embedding-3-* (requires OPENAI_API_KEY)

Queries and documents are embedded through separate entry points. Retrieval
models are trained asymmetrically — a question and the passage answering it are
not the same kind of text — and several models require a task prefix to
distinguish them. Embedding both identically silently gives up accuracy.
"""

import asyncio
from abc import ABC, abstractmethod

import structlog

logger = structlog.get_logger()

# Models that require an explicit task prefix on every input. Without these
# prefixes nomic embeds noticeably worse, and the failure is silent.
_TASK_PREFIXES = {
    "nomic-ai/nomic-embed-text-v1.5": ("search_document: ", "search_query: "),
    "nomic-ai/nomic-embed-text-v1": ("search_document: ", "search_query: "),
    "nomic-ai/nomic-embed-text-v1.5-Q": ("search_document: ", "search_query: "),
    # BGE wants an instruction on the query side only.
    "BAAI/bge-base-en-v1.5": ("", "Represent this sentence for searching relevant passages: "),
    "BAAI/bge-small-en-v1.5": ("", "Represent this sentence for searching relevant passages: "),
    "BAAI/bge-large-en-v1.5": ("", "Represent this sentence for searching relevant passages: "),
}


class EmbeddingProvider(ABC):
    """Base class for embedding providers."""

    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Embed a batch of texts with no task hint. Prefer the methods below."""
        ...

    @abstractmethod
    def dimensions(self) -> int:
        """Return embedding dimensions."""
        ...

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Embed passages destined for the index."""
        return await self.embed(texts)

    async def embed_queries(self, texts: list[str]) -> list[list[float]]:
        """Embed search queries."""
        return await self.embed(texts)


# fastembed defaults to 256, which is tuned for machines with memory to spare.
# Measured on 1200-character chunks: 256 runs at 3.7 chunks/s and 32 at 5.5 —
# the large batch is slower, not faster, because the peak allocation pushes the
# host into swap, and it is what got the server OOM-killed part-way through a
# large workbook. On 512MB free-tier containers (Render/Koyeb) a batch of 8
# alongside threads=1 keeps ONNX inside the memory limit.
#
# One constant, used by both the inner model call and the outer mini-batch
# loop. They were allowed to drift apart once already, and the loop below is
# what actually bounds peak memory.
EMBED_BATCH_SIZE = 8


def _trim_memory():
    """Force Python garbage collection and release heap pages back to OS."""
    import gc
    gc.collect()
    try:
        import ctypes
        libc = ctypes.CDLL("libc.so.6")
        libc.malloc_trim(0)
    except Exception:
        pass


class FastEmbedEmbedder(EmbeddingProvider):
    """Local ONNX embedding provider using FastEmbed (zero API key required)."""

    def __init__(self, model_name: str | None = None, dimensions: int | None = None):
        from app.config import get_settings

        settings = get_settings()
        self.model_name = model_name or settings.embedding_model
        self._dim = dimensions or settings.embedding_dimensions
        self._model = None

        self._doc_prefix, self._query_prefix = _TASK_PREFIXES.get(self.model_name, ("", ""))
        logger.info(
            "embedder_configured",
            model=self.model_name,
            dimensions=self._dim,
            task_prefixes=bool(self._doc_prefix or self._query_prefix),
        )

    @property
    def model(self):
        """
        Load the ONNX weights on first use, not at import.

        Constructing this eagerly made every application start — and, under
        --reload, every file save — wait on hundreds of megabytes of model
        weights before the server would accept a connection.
        """
        if self._model is None:
            from fastembed import TextEmbedding

            logger.info("embedder_loading", model=self.model_name)
            # threads=1 keeps memory footprint minimal inside 512MB RAM containers
            self._model = TextEmbedding(model_name=self.model_name, threads=1)
            logger.info("embedder_ready", model=self.model_name)
        return self._model

    def _run(self, texts: list[str], prefix: str) -> list[list[float]]:
        """Blocking. Call through _run_async from anything on the event loop."""
        if not texts:
            return []
        prepared = [f"{prefix}{t}" for t in texts] if prefix else texts
        results = [
            v.tolist() if hasattr(v, "tolist") else list(v)
            for v in self.model.embed(prepared, batch_size=EMBED_BATCH_SIZE)
        ]
        _trim_memory()
        return results

    async def _run_async(self, texts: list[str], prefix: str) -> list[list[float]]:
        """
        Embed off the event loop in small mini-batches to keep peak memory flat.
        """
        if not texts:
            return []
        all_embeddings: list[list[float]] = []
        for i in range(0, len(texts), EMBED_BATCH_SIZE):
            batch = texts[i : i + EMBED_BATCH_SIZE]
            res = await asyncio.to_thread(self._run, batch, prefix)
            all_embeddings.extend(res)
            _trim_memory()
            await asyncio.sleep(0.01)
        return all_embeddings

    async def embed(self, texts: list[str]) -> list[list[float]]:
        # Untagged inputs are treated as documents, matching the previous
        # behaviour for any caller that has not been updated.
        return await self._run_async(texts, self._doc_prefix)

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return await self._run_async(texts, self._doc_prefix)

    async def embed_queries(self, texts: list[str]) -> list[list[float]]:
        return await self._run_async(texts, self._query_prefix)

    def dimensions(self) -> int:
        return self._dim


class OpenAIEmbedder(EmbeddingProvider):
    """OpenAI text-embedding provider."""

    def __init__(self):
        from openai import AsyncOpenAI

        from app.config import get_settings

        settings = get_settings()
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.model = settings.embedding_model
        self._dimensions = settings.embedding_dimensions

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        all_embeddings = []
        batch_size = 100

        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            response = await self.client.embeddings.create(
                model=self.model,
                input=batch,
            )
            all_embeddings.extend([d.embedding for d in response.data])

        return all_embeddings

    def dimensions(self) -> int:
        return self._dimensions


_provider: EmbeddingProvider | None = None


def get_embedding_provider() -> EmbeddingProvider:
    """
    Return the configured provider, constructed once.

    Cached because the local backend holds a loaded ONNX model; rebuilding it
    per call would reload hundreds of megabytes.
    """
    global _provider
    if _provider is not None:
        return _provider

    from app.config import get_settings

    settings = get_settings()

    if settings.embedding_provider.lower() == "fastembed":
        _provider = FastEmbedEmbedder()
    elif settings.openai_api_key and not settings.openai_api_key.startswith("sk-your-"):
        _provider = OpenAIEmbedder()
    else:
        # Fallback to local embeddings if no hosted key is configured.
        _provider = FastEmbedEmbedder()

    return _provider
