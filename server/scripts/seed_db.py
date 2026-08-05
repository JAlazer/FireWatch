#!/usr/bin/env python3#!/usr/bin/env python3
"""
Load app/data/mock_data.py into the database. Assumes the schema already
exists (run `alembic upgrade head` first — this script does NOT create
tables or the hypertable, that's the migration's job, kept separate on
purpose: schema creation is a one-time/versioned thing, data seeding is
something you'll want to re-run repeatedly in dev).

Usage:
    python scripts/seed_db.py            # insert, error on conflict
    python scripts/seed_db.py --reset    # TRUNCATE all four tables first

Insert order matters — respects the FK chain (users -> lifestyle/biometrics
-> inflammation_scores) and biometrics before inflammation_scores since
nothing enforces that at the DB level, only logical dependency.
"""

import argparse
import asyncio
import sys
from pathlib import Path

# See create_tables.py for why this line is here — same reasoning applies.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import delete, insert

from app.data.mock_data import MOCK_BIOMETRICS, MOCK_INFLAMMATION_SCORES, MOCK_USERS
from app.db.session import AsyncSessionLocal
from app.models.biometrics import Biometrics
from app.models.inflammation import InflammationScore
from app.models.lifestyle import Lifestyle
from app.models.user import User


async def reset(session) -> None:
    # Order matters here too — children before parents, so FKs don't block
    # the delete.
    for model in (InflammationScore, Biometrics, Lifestyle, User):
        await session.execute(delete(model))
    print("Truncated inflammation_scores, biometrics, lifestyle, users.")


async def seed_users_and_lifestyle(session) -> None:
    users_rows = [entry["user"] for entry in MOCK_USERS.values()]
    lifestyle_rows = [entry["lifestyle"] for entry in MOCK_USERS.values()]

    await session.execute(insert(User), users_rows)
    await session.execute(insert(Lifestyle), lifestyle_rows)
    print(f"Inserted {len(users_rows)} users, {len(lifestyle_rows)} lifestyle rows.")


async def seed_biometrics(session) -> None:
    if not MOCK_BIOMETRICS:
        print("No biometrics to insert.")
        return
    await session.execute(insert(Biometrics), MOCK_BIOMETRICS)
    print(f"Inserted {len(MOCK_BIOMETRICS)} biometric samples.")


async def seed_inflammation_scores(session) -> None:
    if not MOCK_INFLAMMATION_SCORES:
        print("No inflammation scores to insert (expected if every mock user is still calibrating).")
        return
    await session.execute(insert(InflammationScore), MOCK_INFLAMMATION_SCORES)
    print(f"Inserted {len(MOCK_INFLAMMATION_SCORES)} inflammation score rows.")


async def main(do_reset: bool) -> None:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            if do_reset:
                await reset(session)
            await seed_users_and_lifestyle(session)
            await seed_biometrics(session)
            await seed_inflammation_scores(session)
        # session.begin() commits on clean exit, rolls back on exception —
        # so either everything above lands, or nothing does.
    print("\nDone.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="Truncate the four tables before seeding")
    args = parser.parse_args()
    asyncio.run(main(args.reset))