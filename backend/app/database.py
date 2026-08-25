"""
KnowledgeHub Backend — Database engine and session management.

Uses async SQLAlchemy with asyncpg driver.
"""

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

def _normalize_async_url(url: str) -> str:
    """Ensure DATABASE_URL uses the asyncpg driver."""
    if not url:
        return url
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url[len("postgres://") :]
    if url.startswith("postgresql://") and not url.startswith("postgresql+"):
        return "postgresql+asyncpg://" + url[len("postgresql://") :]
    if url.startswith("postgresql+psycopg2://"):
        return "postgresql+asyncpg://" + url[len("postgresql+psycopg2://") :]
    return url


settings = get_settings()
db_url = _normalize_async_url(settings.database_url)

engine = create_async_engine(
    db_url,
    echo=settings.db_echo,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
    connect_args={
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
    },
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


async def get_db() -> AsyncSession:
    """FastAPI dependency that yields a database session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
