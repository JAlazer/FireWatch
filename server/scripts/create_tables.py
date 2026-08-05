#!/usr/bin/env python3
"""
Create every table via SQLAlchemy's own Base.metadata.create_all() — no
Alembic. This is the right tool while the schema is still actively changing
and there's no data anyone needs preserved across a change (see the
conversation this replaced 0001_create_core_tables.py in: Alembic is worth
the extra tooling once real data exists that a schema change could destroy;
until then it's solving a problem you don't have yet).

Only creates tables that don't already exist — it will NOT add a missing
column to a table that's already there. If you change a model, the
workflow is: drop the affected table(s) (or run --reset for all of them),
re-run this script, then re-run seed_db.py. Fine while everything here is
mock data.

Usage:
    python scripts/create_tables.py            # create tables if missing
    python scripts/create_tables.py --reset    # drop everything, recreate
"""

import argparse
import asyncio
import sys
from pathlib import Path

# Running this file directly (`python scripts/create_tables.py`) puts only
# scripts/ on sys.path, not the project root next to it — so `app` is
# invisible unless we add it explicitly. This makes the script work the
# same way regardless of cwd or how it's invoked.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text

from app.db.base import Base
from app.db.session import engine

# Explicit, not incidental: Base.metadata is only complete once every model
# class has been imported somewhere. This used to happen automatically
# inside db/base.py — moved here (and to every other entry point that needs
# full metadata, e.g. seed_db.py already does this) after that caused a
# circular import the moment a model got imported directly, before
# db/base.py, elsewhere in the codebase.
from app.models.user import User  # noqa: F401
from app.models.lifestyle import Lifestyle  # noqa: F401
from app.models.biometrics import Biometrics  # noqa: F401
from app.models.inflammation import InflammationScore  # noqa: F401


async def create_all(conn) -> None:
    await conn.run_sync(Base.metadata.create_all)
    print("Created tables (skipped any that already existed).")


async def drop_all(conn) -> None:
    await conn.run_sync(Base.metadata.drop_all)
    print("Dropped all tables.")


async def convert_to_hypertable(conn) -> None:
    """Everything the migration's raw SQL did — just run directly now,
    right after the plain table exists. Safe to re-run: create_hypertable
    is a no-op if biometrics is already a hypertable (if_not_exists=>TRUE).
    For compression, check compression_enabled on timescaledb_information.
    hypertables rather than inspecting compression_settings' columns
    directly — that view's column layout has changed across TimescaleDB
    versions (confirmed: compress_segmentby doesn't exist on at least one
    real TigerCloud instance), whereas compression_enabled is a stable
    boolean that's been consistent across 2.x."""
    await conn.execute(text(
        "SELECT create_hypertable('biometrics', 'start_at', "
        "chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);"
    ))

    result = (await conn.execute(text(
        "SELECT compression_enabled FROM timescaledb_information.hypertables "
        "WHERE hypertable_name = 'biometrics';"
    ))).first()
    if result and result[0]:
        print("Compression already enabled on biometrics, skipping.")
        return

    try:
        await conn.execute(text(
            "ALTER TABLE biometrics SET ("
            "  timescaledb.compress,"
            "  timescaledb.compress_segmentby = 'user_id, metric_type',"
            "  timescaledb.compress_orderby = 'start_at DESC'"
            ");"
        ))
        await conn.execute(text(
            "SELECT add_compression_policy('biometrics', INTERVAL '7 days');"
        ))
        print("Converted biometrics to a hypertable (1-day chunks) + compression policy (7-day-old chunks).")
    except Exception as e:
        # Second safety net: if compression was already configured despite
        # the check above missing it (e.g. a policy exists but
        # compression_enabled read stale), Postgres/Timescale will raise
        # rather than silently no-op — don't let that crash the whole
        # script on a re-run.
        print(f"Compression setup skipped (likely already configured): {e}")


async def main(do_reset: bool) -> None:
    # Two separate transactions on purpose, after seeing what happened when
    # this was one: a later failure (hypertable/compression setup) rolled
    # back earlier steps (table creation) that had already succeeded and
    # printed as if they'd landed. Splitting them means a failure in step 2
    # can't silently erase step 1's work — re-running just resumes from
    # wherever it actually left off, since both steps are already
    # idempotent (create_all skips existing tables; create_hypertable and
    # the compression check both no-op if already done).
    async with engine.begin() as conn:
        if do_reset:
            await drop_all(conn)
        await create_all(conn)

    async with engine.begin() as conn:
        await convert_to_hypertable(conn)

    print("\nDone. Run scripts/seed_db.py next to load mock data.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="Drop every table first")
    args = parser.parse_args()
    asyncio.run(main(args.reset))