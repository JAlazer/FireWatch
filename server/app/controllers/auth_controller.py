from fastapi import APIRouter, Depends

from app.core.auth import verify_clerk_session
from app.core.dependencies import get_lifestyle_repo, get_user_repo
from app.repository.lifestyle_repository import LifestyleRepository
from app.repository.user_repository import UserRepository
from app.schemas.user import UserSyncResponse
from app.services import user_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/sync", response_model=UserSyncResponse)
def sync_user(
    clerk_user_id: str = Depends(verify_clerk_session),
    user_repo: UserRepository = Depends(get_user_repo),
    lifestyle_repo: LifestyleRepository = Depends(get_lifestyle_repo),
) -> UserSyncResponse:
    return user_service.sync_user(clerk_user_id, user_repo, lifestyle_repo)