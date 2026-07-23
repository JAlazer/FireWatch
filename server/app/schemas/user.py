from datetime import datetime

from pydantic import BaseModel


class UserCreate(BaseModel):
    name: str
    email: str


class UserResponse(BaseModel):
    user_id: str
    name: str
    email: str
    created_at: datetime
    