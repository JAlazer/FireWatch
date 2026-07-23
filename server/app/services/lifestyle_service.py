from fastapi import HTTPException

from app.repository.base_repository import BaseRepository
from app.schemas.lifestyle import LifestyleProfileCreate, LifestyleProfileResponse


def get_lifestyle(user_id: str, repo: BaseRepository) -> LifestyleProfileResponse:
    record = repo.get(user_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Lifestyle profile not found for user")
    return LifestyleProfileResponse(**record)


def update_lifestyle(user_id: str, data: LifestyleProfileCreate, repo: BaseRepository) -> LifestyleProfileResponse:
    record = repo.update(user_id, data.model_dump())
    if record is None:
        raise HTTPException(status_code=404, detail="User not found")
    return LifestyleProfileResponse(**record)

def create_lifestyle(user_id: str, data: LifestyleProfileCreate, repo: BaseRepository) -> LifestyleProfileResponse:
    record = repo.create({"user_id": user_id, **data.model_dump()})
    return LifestyleProfileResponse(**record)

