 # Sets up the DB engine/connection and yields sessions per request
"""
Async SQLAlchemy engine/session setup, for asyncpg against TigerCloud.
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=settings.environment == "development",
    pool_pre_ping=True,  # TigerCloud connections can idle out; this checks liveness before reuse
    pool_size=5,
    max_overflow=10,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency. One session per request, committed on clean exit,
    rolled back on exception — the controller/service layer should not call
    commit() itself for request-scoped writes."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise