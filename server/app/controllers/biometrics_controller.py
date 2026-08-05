from fastapi import APIRouter, Depends

from app.core.dependencies import get_biometrics_repo
from app.repository.biometrics_repository import BiometricsRepository
from app.schemas.biometrics import BiometricsCreate, BiometricsResponse
from app.services import biometrics_service

router = APIRouter(prefix="/users", tags=["biometrics"])


@router.get("/{user_id}/biometrics", response_model=BiometricsResponse)
def get_biometrics(user_id: str, repo: BiometricsRepository = Depends(get_biometrics_repo)) -> BiometricsResponse:
    return biometrics_service.get_biometrics(user_id, repo)


@router.post("/{user_id}/biometrics", response_model=BiometricsResponse, status_code=201)
def save_biometrics(
    user_id: str,
    data: BiometricsCreate,
    repo: BiometricsRepository = Depends(get_biometrics_repo),
) -> BiometricsResponse:
    return biometrics_service.save_biometrics(user_id, data, repo)