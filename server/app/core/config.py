"""
App configuration. Reads from environment / a .env-style file via
pydantic-settings.

ASSUMPTION: this is the first app/core/config.py in the project (per your
confirmation) — if you already have env-var conventions elsewhere (a
different .env location, different variable names), rename to match rather
than running two parallel config sources.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# app/core/config.py -> app/core -> app -> project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Resolved from PROJECT_ROOT, not the process's cwd — so this finds
        # the file the same way whether you run `python scripts/foo.py`
        # from the repo root or from inside scripts/.
        env_file=PROJECT_ROOT / "tiger-cloud-firewatch-db-54901-credentials.env",
        extra="ignore",
    )

    # TigerCloud's credentials export uses the key TIMESCALE_SERVICE_URL,
    # not DATABASE_URL — validation_alias tells pydantic-settings to read
    # THAT key from the env file, while the rest of the codebase still
    # refers to it as settings.database_url (the alias only affects how the
    # value gets IN, not what you call it once it's loaded).
    #
    # The value TigerCloud gives you is typically plain
    # "postgresql://...?sslmode=require" — the validator below rewrites it
    # to "postgresql+asyncpg://...?ssl=require" automatically, so you don't
    # need to hand-edit the string yourself (a step that's caused most of
    # the back-and-forth on this so far).
    database_url: str = Field(validation_alias="TIMESCALE_SERVICE_URL")

    # Needed again after being removed alongside Alembic (that removal was
    # about migration tooling specifically, not sync-vs-async in general).
    # The users/biometrics/lifestyle repos are staying SYNCHRONOUS to match
    # the rest of the app's existing pattern — only inflammation is async —
    # so they need a psycopg2-driver URL, not asyncpg's. Derived
    # automatically from database_url so you still only maintain one value
    # day-to-day.
    database_url_sync: str | None = None

    environment: str = "development"

    @field_validator("database_url")
    @classmethod
    def _normalize_for_asyncpg(cls, v: str) -> str:
        if v.startswith("postgresql://"):
            v = "postgresql+asyncpg://" + v[len("postgresql://"):]
        elif v.startswith("postgres://"):
            v = "postgresql+asyncpg://" + v[len("postgres://"):]
        v = v.replace("sslmode=require", "ssl=require").replace("sslmode=verify-full", "ssl=verify-full")
        return v

    @property
    def sync_database_url(self) -> str:
        if self.database_url_sync:
            return self.database_url_sync
        # Reverse of the asyncpg normalization above: swap the driver back,
        # and psycopg2 wants sslmode=require (libpq convention), not ssl=require.
        return self.database_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://").replace(
            "ssl=require", "sslmode=require"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()