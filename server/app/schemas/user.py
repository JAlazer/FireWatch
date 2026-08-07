from datetime import datetime

from pydantic import BaseModel


class UserCreate(BaseModel):
    first_name: str
    last_name: str
    email: str


class UserResponse(BaseModel):
    user_id: str
    first_name: str 
    last_name: str 
    email: str
    created_at: datetime

class UserSyncResponse(UserResponse):
    onboarding_completed: bool