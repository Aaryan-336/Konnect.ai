"""
KnowledgeHub Backend — Application Configuration

All settings are loaded from environment variables via pydantic-settings.
"""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Application ---
    app_name: str = "KnowledgeHub"
    app_env: str = "development"
    cors_origins: str = "http://localhost:3000"
    log_level: str = "INFO"

    # --- Database ---
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/knowledgehub"
    database_url_sync: str = "postgresql://postgres:postgres@localhost:5432/knowledgehub"

    # --- Redis ---
    redis_url: str = "redis://localhost:6379/0"

    # --- JWT ---
    jwt_secret_key: str = "CHANGE_ME_TO_A_RANDOM_SECRET_AT_LEAST_32_CHARS"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # --- LLM ---
    llm_provider: str = "groq"
    # Upper bound on generated tokens. The structured answer contract (prose +
    # tables + charts + citations) needs materially more room than plain chat;
    # truncating it mid-JSON is what produces unrenderable responses.
    # Note that providers count prompt + max_tokens against a single per-request
    # budget (Groq's free tier allows 8000), so this cannot be raised without
    # also lowering rag_context_k.
    # Measured: a full structured answer (headline, prose, key points, a table
    # and citations) lands around 800-1100 tokens. Providers reserve the whole
    # max_tokens against the per-minute budget whether or not it is used, so
    # every token of headroom here is throughput thrown away. Raise it only if
    # answers start truncating mid-JSON.
    llm_max_output_tokens: int = 1400
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    openai_max_tokens: int = 4096

    # --- Groq ---
    groq_api_key: str = ""
    # Groq applies a per-day token cap per model on the free tier (200k).
    # 20b carries its own budget and is markedly cheaper per answer; 120b is
    # the better model when the account has headroom for it.
    groq_model: str = "openai/gpt-oss-120b"
    groq_base_url: str = "https://api.groq.com/openai/v1"
    # gpt-oss reasoning is billed and counts against max_tokens. "low" leaves
    # room for the answer on short structured calls; "medium"/"high" need a
    # correspondingly larger max_tokens.
    groq_reasoning_effort: str = "low"

    # --- Embeddings ---
    embedding_provider: str = "fastembed"
    # bge-small-en-v1.5: 384d, ~130MB of ONNX weights, and measured at 9.2
    # chunks/s here against nomic-embed-text-v1.5's 5.5 on identical input.
    # nomic accepts 8192 tokens per input to bge's 512, but that headroom is
    # not reachable while max_chunk_size is 1200 characters (~300 tokens), so
    # it bought nothing and cost ~420MB resident on an 8GB host.
    # Raising max_chunk_size past roughly 2000 characters would make nomic
    # worth revisiting. Requires the query-side instruction prefix, applied in
    # ingestion/embedder.py.
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    embedding_dimensions: int = 384

    # --- STT ---
    # "auto" prefers whichever backend is actually configured, cheapest first:
    # Groq (free tier) -> local faster-whisper (keyless) -> OpenAI (paid).
    # Force one with "groq", "local", or "openai".
    stt_provider: str = "auto"
    # Model used by the paid OpenAI backend.
    stt_model: str = "whisper-1"
    # Groq's Whisper deployment. "turbo" is ~4x faster than large-v3 at
    # near-identical accuracy, which matters for a hold-to-talk mic.
    groq_stt_model: str = "whisper-large-v3-turbo"
    # Local faster-whisper. "base" transcribes faster than real time on CPU;
    # "small" or "medium" trade speed for accuracy.
    local_stt_model: str = "base"
    local_stt_compute_type: str = "int8"

    # --- RAG ---
    # Query rewriting costs one extra LLM call per question. It buys coreference
    # resolution and vocabulary bridging, but on a tight tokens-per-minute
    # budget it is the first thing to trade away.
    rag_query_rewrite_enabled: bool = True
    # Restrict a search to the documents the question names, using descriptors
    # extracted at ingest. Purely lexical, so it costs no tokens per query.
    rag_document_routing_enabled: bool = True
    # Context width is the single biggest lever on answer quality here.
    # Measured on the Series B deck: at 5 chunks "who is the fund manager"
    # returns only the managing entity; at 12 the same model also surfaces the
    # named investment team. The ceiling is the provider's per-request token
    # budget (8k on Groq's free tier), not the model's context window.
    rag_candidate_k: int = 40
    rag_rerank_k: int = 12
    rag_context_k: int = 12
    rag_evidence_threshold: float = 0.3
    # Characters of each retrieved chunk sent to the model. Chunks can reach
    # 1500 chars; trimming the tail keeps the prompt inside the provider's
    # per-request token budget without dropping whole chunks of evidence.
    rag_max_context_chars: int = 1100
    # A single spreadsheet dump chunked to 2,796 rows takes minutes to embed and
    # is a data export rather than a document. Past this the tail is dropped and
    # the document records that it was truncated, so the cost stays bounded and
    # the loss is visible instead of silent.
    max_chunks_per_document: int = 1200

    # Echo every statement, with parameters, to the log. Off by default: chunk
    # inserts carry the full passage and its vector, so a single ingest writes
    # megabytes of log and slows the run measurably.
    db_echo: bool = False

    # --- File Storage ---
    upload_dir: str = "./uploads"

    # --- Celery ---
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    # --- Rate Limiting ---
    rate_limit_login: str = "5/minute"
    rate_limit_query: str = "30/minute"
    rate_limit_voice: str = "10/minute"

    # --- Default Admin ---
    default_admin_email: str = "admin@knowledgehub.ai"
    default_admin_password: str = "ASK30"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()
