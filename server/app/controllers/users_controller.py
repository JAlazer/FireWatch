from fastapi import APIRouter, Depends

from app.core.dependencies import get_user_repo
from app.repository.user_repository import UserRepository
from app.schemas.user import UserCreate, UserResponse
from app.services import user_service

router = APIRouter(prefix="/users", tags=["users"])


@router.post("", response_model=UserResponse, status_code=201)
def create_user(data: UserCreate, repo: UserRepository = Depends(get_user_repo)) -> UserResponse:
    return user_service.create_user(data, repo)


@router.get("/{user_id}", response_model=UserResponse)
def get_user(user_id: str, repo: UserRepository = Depends(get_user_repo)) -> UserResponse:
    return user_service.get_user(user_id, repo)

@router.get("", response_model=list[UserResponse])
def get_all_users(repo: UserRepository = Depends(get_user_repo)) -> list[UserResponse]:
    return user_service.get_all_users(repo)