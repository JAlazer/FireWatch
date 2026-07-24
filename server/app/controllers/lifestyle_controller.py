from fastapi import APIRouter, Depends

from app.core.dependencies import get_lifestyle_repo
from app.repository.mock_lifestyle_repository import MockLifestyleRepository
from app.schemas.lifestyle import LifestyleProfileCreate, LifestyleProfileResponse
from app.services import lifestyle_service

router = APIRouter(prefix="/users", tags=["lifestyle"])


@router.get("/{user_id}/lifestyle", response_model=LifestyleProfileResponse)
def get_lifestyle(user_id: str, repo: MockLifestyleRepository = Depends(get_lifestyle_repo)) -> LifestyleProfileResponse:
    return lifestyle_service.get_lifestyle(user_id, repo)


@router.put("/{user_id}/lifestyle", response_model=LifestyleProfileResponse)
def update_lifestyle(
    user_id: str,
    data: LifestyleProfileCreate,
    repo: MockLifestyleRepository = Depends(get_lifestyle_repo),
) -> LifestyleProfileResponse:
    return lifestyle_service.update_lifestyle(user_id, data, repo)

@router.post("/{user_id}/lifestyle", response_model=LifestyleProfileResponse, status_code=201)
def create_lifestyle(
    user_id: str,
    data: LifestyleProfileCreate,
    repo: MockLifestyleRepository = Depends(get_lifestyle_repo),
) -> LifestyleProfileResponse:
    return lifestyle_service.create_lifestyle(user_id, data, repo)
