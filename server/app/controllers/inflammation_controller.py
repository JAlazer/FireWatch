"""
Inflammation endpoint. GET only — recompute() is deliberately not exposed
here; it's meant to be called from an ingestion-triggered job or cron, not
from a client-facing route (see inflammation_service.py's module docstring).

ASSUMPTIONS: `get_db` dependency lives at app.db.session, and a
UserRepository already exists at app.repository.user_repository with a
`get(user_id)` method — adjust imports to match your actual layout.
"""

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.db.session import get_db
from app.repository.inflammation_repo import InflammationRepository
from app.repository.user_repository import UserRepository
from app.schemas.inflammation import InflammationResponse
from app.services.inflammation_service import InflammationService

router = APIRouter(prefix="/users/{user_id}/inflammation", tags=["inflammation"])


@router.get("", response_model=InflammationResponse)
async def read_inflammation(
    user_id: str,
    target_date: date | None = None,
    db=Depends(get_db),
) -> InflammationResponse:
    user_repo = UserRepository(db)
    if await user_repo.get(user_id) is None:
        raise HTTPException(status_code=404, detail="User not found")

    service = InflammationService(InflammationRepository(db))
    return await service.get_for_day(user_id, target_date or datetime.now(timezone.utc).date())