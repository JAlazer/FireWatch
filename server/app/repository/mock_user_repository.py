import copy
import uuid
from datetime import datetime

from app.data.mock_users import MOCK_USERS
from app.repository.base_repository import BaseRepository


class MockUserRepository(BaseRepository[dict]):
    def __init__(self) -> None:
        self._store: dict[str, dict] = {
            uid: copy.deepcopy(record["user"]) for uid, record in MOCK_USERS.items()
        }

    def get(self, id: str) -> dict | None:
        return self._store.get(id)

    def get_all(self) -> list[dict]:
        return list(self._store.values())

    def create(self, data: dict) -> dict:
        user_id = str(uuid.uuid4())
        record = {**data, "user_id": user_id, "created_at": datetime.utcnow()}
        self._store[user_id] = record
        return record

    def update(self, id: str, data: dict) -> dict | None:
        if id not in self._store:
            return None
        self._store[id] = {**self._store[id], **data}
        return self._store[id]
