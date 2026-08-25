"""
KnowledgeHub Backend — FastAPI Application

Enterprise Knowledge Intelligence Platform
"""

import uuid
import structlog
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text

from app.config import get_settings
from app.database import engine, async_session_factory, Base
from app.models.tenant import Tenant
from app.models.user import User, Role, UserRole
from app.auth.local_provider import LocalAuthProvider

from app.routes.health import router as health_router
from app.routes.auth import router as auth_router
from app.routes.knowledge import router as knowledge_router
from app.routes.agents import router as agents_router, builder_router
from app.routes.chat import router as chat_router, conversations_router
from app.routes.voice import router as voice_router
from app.routes.admin import router as admin_router

settings = get_settings()
logger = structlog.get_logger()

# Configure structured logging
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.dev.ConsoleRenderer() if settings.app_env == "development"
        else structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.BoundLogger,
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
)


async def seed_database():
    """Seed default tenant, roles, and super admin on first run."""
    async with async_session_factory() as db:
        # Check if already seeded
        result = await db.execute(select(Tenant).limit(1))
        tenant = result.scalar_one_or_none()
        if tenant:
            # Sync default admin password if changed in .env
            admin_res = await db.execute(
                select(User).where(User.tenant_id == tenant.id, User.email == settings.default_admin_email)
            )
            admin_user = admin_res.scalar_one_or_none()
            if admin_user:
                import bcrypt
                # Check if password matches
                if not bcrypt.checkpw(settings.default_admin_password.encode("utf-8"), admin_user.password_hash.encode("utf-8")):
                    admin_user.password_hash = bcrypt.hashpw(
                        settings.default_admin_password.encode("utf-8"), bcrypt.gensalt()
                    ).decode("utf-8")
                    await db.commit()
                    logger.info("admin_password_synced", email=admin_user.email)
            return

        logger.info("seeding_database", message="Creating default tenant and admin")

        # Enable pgvector extension
        try:
            await db.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            await db.commit()
        except Exception:
            await db.rollback()

        # Create default tenant
        tenant = Tenant(
            name="Default Organization",
            slug="default",
            status="active",
        )
        db.add(tenant)
        await db.flush()

        # Create roles
        role_names = ["USER", "AGENT_MANAGER", "KNOWLEDGE_ADMIN", "ADMIN", "SUPER_ADMIN"]
        roles = {}
        for name in role_names:
            role = Role(name=name)
            db.add(role)
            roles[name] = role
        await db.flush()

        # Create super admin
        auth = LocalAuthProvider()
        user_data = await auth.register(
            db, tenant.id,
            settings.default_admin_email,
            settings.default_admin_password,
            "System Administrator",
            role_name="SUPER_ADMIN",
        )

        await db.commit()
        logger.info(
            "database_seeded",
            admin_email=settings.default_admin_email,
            message="Default admin created. CHANGE THE PASSWORD IMMEDIATELY.",
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown."""
    get_settings.cache_clear()
    current_settings = get_settings()

    # Log database host (masked password for security)
    try:
        from urllib.parse import urlparse
        parsed = urlparse(current_settings.database_url)
        db_host = f"{parsed.hostname}:{parsed.port or 5432}{parsed.path}"
        logger.info("database_connecting", host=db_host)
    except Exception:
        pass

    # Retry connection on startup (useful for cloud database cold-starts)
    max_retries = 5
    for attempt in range(1, max_retries + 1):
        try:
            async with engine.begin() as conn:
                try:
                    await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
                except Exception:
                    pass
                await conn.run_sync(Base.metadata.create_all)
            await seed_database()
            logger.info("database_ready")
            break
        except Exception as e:
            if attempt == max_retries:
                logger.error(
                    "database_connection_failed",
                    error=str(e),
                    hint="Check that DATABASE_URL is set correctly in your Render Environment tab.",
                )
                raise
            logger.warning(
                "database_connection_retry",
                attempt=attempt,
                max_retries=max_retries,
                error=str(e),
            )
            import asyncio
            await asyncio.sleep(2)

    logger.info("app_started", app=current_settings.app_name, env=current_settings.app_env)
    yield

    await engine.dispose()
    logger.info("app_stopped")


# Create FastAPI app
app = FastAPI(
    title="KnowledgeHub API",
    description="Enterprise Knowledge Intelligence Platform",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(knowledge_router)
app.include_router(agents_router)
app.include_router(builder_router)
app.include_router(chat_router)
app.include_router(conversations_router)
app.include_router(voice_router)
app.include_router(admin_router)
