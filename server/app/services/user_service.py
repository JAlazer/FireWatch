from fastapi import HTTPException

from app.repository.base_repository import BaseRepository
from app.schemas.user import UserCreate, UserResponse

from app.core.auth import clerk


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

def sync_user(clerk_user_id: str, user_repo: BaseRepository, lifestyle_repo: BaseRepository) -> dict:
    # Step 1: check if we already have a row for this Clerk user
    existing_user = user_repo.get_by_clerk_id(clerk_user_id)

    if existing_user is not None:
        # They already exist — just attach whether they've finished onboarding
        existing_user["onboarding_completed"] = _has_onboarded(existing_user["user_id"], lifestyle_repo)
        return existing_user

    # Step 2: no row yet — fetch this person's profile from Clerk directly
    profile = clerk.users.get(user_id=clerk_user_id)

    # Step 3: Clerk profiles can have multiple email addresses (e.g. after
    # a user adds a second one), so we loop through them and find the one
    # marked as "primary" on the profile.
    primary_email = None
    for email_entry in profile.email_addresses:
        if email_entry.id == profile.primary_email_address_id:
            primary_email = email_entry.email_address
            break

    # Step 4: pull first/last name straight off the profile
    first_name = profile.first_name
    last_name = profile.last_name

    if not first_name and not last_name:
        print(f"Clerk user {clerk_user_id} synced with no name on profile")
        first_name = "Unknown"

    # Step 5: create the row in our own users table
    new_user = user_repo.create({
        "clerk_user_id": clerk_user_id,
        "first_name": first_name,
        "last_name": last_name,
        "email": primary_email,
    })

    new_user["onboarding_completed"] = False
    return new_user

def _has_onboarded(user_id: str, lifestyle_repo: BaseRepository) -> bool:
    return lifestyle_repo.get(user_id) is not None