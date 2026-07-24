from fastapi import APIRouter, Depends

from app.core.dependencies import get_biometrics_repo
from app.repository.mock_biometrics_repository import MockBiometricsRepository
from app.schemas.inflammation import InflammationResponse
from app.services import inflammation_service

router = APIRouter(prefix="/users", tags=["inflammation"])


@router.get("/{user_id}/inflammation", response_model=InflammationResponse)
def get_inflammation(
    user_id: str,
    biometrics_repo: MockBiometricsRepository = Depends(get_biometrics_repo),
) -> InflammationResponse:
    return inflammation_service.get_inflammation_score(user_id, biometrics_repo)
