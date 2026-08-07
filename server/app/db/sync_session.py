"""
Sync SQLAlchemy engine/session, separate from db/session.py's async one.
Two engines is a real cost (two connection pools to the same database) —
justified here because users/biometrics/lifestyle are staying sync to match
BaseRepository and the existing controllers/services, while inflammation
stays the one async exception. If more of the app moves to async later,
this file (and psycopg2 as a dependency) can go away entirely.
"""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

settings = get_settings()

sync_engine = create_engine(
    settings.sync_database_url,
    echo=settings.environment == "development",
    pool_pre_ping=True,
)

SyncSessionLocal = sessionmaker(bind=sync_engine, autoflush=False, expire_on_commit=False)


def get_sync_db() -> Generator[Session, None, None]:
    """FastAPI dependency — one session per request, committed on clean
    exit, rolled back on exception. Mirrors db/session.py's get_db(), sync
    instead of async."""
    db = SyncSessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()