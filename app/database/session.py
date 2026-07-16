"""Async SQLAlchemy engine and session management."""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config.settings import Settings, get_settings

_engine: AsyncEngine | None = None
_async_session_factory: async_sessionmaker[AsyncSession] | None = None


def create_engine(settings: Settings) -> AsyncEngine:
    """Create an async SQLAlchemy engine."""
    return create_async_engine(
        settings.database_url,
        echo=settings.database_echo,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
    )


def init_db(settings: Settings | None = None) -> async_sessionmaker[AsyncSession]:
    """Initialize the global engine and session factory."""
    global _engine, _async_session_factory

    resolved_settings = settings or get_settings()
    _engine = create_engine(resolved_settings)
    _async_session_factory = async_sessionmaker(
        bind=_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
        autocommit=False,
    )
    return _async_session_factory


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Return the initialized session factory."""
    if _async_session_factory is None:
        init_db()
    assert _async_session_factory is not None  # noqa: S101
    return _async_session_factory


async def close_db() -> None:
    """Dispose of the database engine and release connections."""
    global _engine, _async_session_factory
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _async_session_factory = None


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async database session with automatic cleanup."""
    factory = get_session_factory()

    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
