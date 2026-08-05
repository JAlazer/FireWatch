"""
Real DB-backed access to User records. Implements BaseRepository's sync
interface (get/get_all/create/update) and returns plain dicts, matching
mock_user_repository.py's contract exactly — so user_service.py needs zero
changes to use this instead of the mock.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User
from app.repository.base_repository import BaseRepository


def _to_dict(user: User) -> dict:
    return {
        "user_id": str(user.id),  # id -> user_id: see schemas/user.py's note
        "name": user.name,
        "email": user.email,
        "created_at": user.created_at,
    }


class UserRepository(BaseRepository[dict]):
    def __init__(self, db: Session):
        self.db = db

    def get(self, id: str) -> dict | None:
        user = self.db.execute(select(User).where(User.id == id)).scalar_one_or_none()
        return _to_dict(user) if user else None

    def get_all(self) -> list[dict]:
        users = self.db.execute(select(User)).scalars().all()
        return [_to_dict(u) for u in users]

    def create(self, data: dict) -> dict:
        # No real Clerk auth yet (client doesn't send a clerk_user_id) —
        # synthesize a placeholder so the NOT NULL/UNIQUE constraint is
        # satisfied. Swap this for the real Clerk ID once auth is wired up.
        user = User(
            id=uuid.uuid4(),
            clerk_user_id=f"pending_clerk_{uuid.uuid4()}",
            name=data.get("name"),
            email=data["email"],
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(user)
        self.db.flush()
        return _to_dict(user)

    def update(self, id: str, data: dict) -> dict | None:
        user = self.db.execute(select(User).where(User.id == id)).scalar_one_or_none()
        if user is None:
            return None
        if "name" in data:
            user.name = data["name"]
        if "email" in data:
            user.email = data["email"]
        self.db.flush()
        return _to_dict(user)