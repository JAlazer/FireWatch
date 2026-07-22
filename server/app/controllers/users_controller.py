from fastapi import APIRouter, Depends

from app.core.dependencies import get_user_repo
from app.repository.mock_user_repository import MockUserRepository
from app.schemas.user import UserCreate, UserResponse
from app.services import user_service

router = APIRouter(prefix="/users", tags=["users"])


@router.post("", response_model=UserResponse, status_code=201)
def create_user(data: UserCreate, repo: MockUserRepository = Depends(get_user_repo)) -> UserResponse:
    return user_service.create_user(data, repo)


@router.get("/{user_id}", response_model=UserResponse)
def get_user(user_id: str, repo: MockUserRepository = Depends(get_user_repo)) -> UserResponse:
    return user_service.get_user(user_id, repo)
