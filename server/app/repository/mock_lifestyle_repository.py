import copy

from app.data.mock_users import MOCK_USERS
from app.repository.base_repository import BaseRepository


class MockLifestyleRepository(BaseRepository[dict]):
    def __init__(self) -> None:
        self._store: dict[str, dict] = {
            uid: {**copy.deepcopy(record["lifestyle"]), "user_id": uid}
            for uid, record in MOCK_USERS.items()
        }

    def get(self, id: str) -> dict | None:
        return self._store.get(id)

    def get_all(self) -> list[dict]:
        return list(self._store.values())

    def create(self, data: dict) -> dict:
        user_id = data["user_id"]
        self._store[user_id] = data
        return data

    def update(self, id: str, data: dict) -> dict | None:
        if id not in self._store:
            return None
        record = {**data, "user_id": id}
        self._store[id] = record
        return record
