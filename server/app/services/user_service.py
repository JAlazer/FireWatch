from fastapi import HTTPException

from app.repository.base_repository import BaseRepository
from app.schemas.user import UserCreate, UserResponse


def get_user(user_id: str, repo: BaseRepository) -> UserResponse:
    record = repo.get(user_id)
    if record is None:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(**record)


def create_user(data: UserCreate, repo: BaseRepository) -> UserResponse:
    record = repo.create(data.model_dump())
    return UserResponse(**record)

def get_all_users(repo: BaseRepository) -> list[UserResponse]:
    records = repo.get_all()
    return [UserResponse(**record) for record in records]