from fastapi import HTTPException

from app.repository.base_repository import BaseRepository
from app.schemas.biometrics import BiometricsCreate, BiometricsResponse


def get_biometrics(user_id: str, repo: BaseRepository) -> BiometricsResponse:
    record = repo.get(user_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Biometrics not found for user")
    return BiometricsResponse(**record)


def save_biometrics(user_id: str, data: BiometricsCreate, repo: BaseRepository) -> BiometricsResponse:
    record = repo.create({"user_id": user_id, **data.model_dump()})
    return BiometricsResponse(**record)
