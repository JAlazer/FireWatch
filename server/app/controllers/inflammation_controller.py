"""
Inflammation endpoint. GET only — recompute() is deliberately not exposed
here; it's meant to be called from an ingestion-triggered job or cron, not
from a client-facing route (see inflammation_service.py's module docstring).
"""

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.db.session import get_db
from app.repository.inflammation_repo import InflammationRepository
from app.schemas.inflammation import InflammationResponse
from app.services.inflammation_service import InflammationService

router = APIRouter(prefix="/users/{user_id}/inflammation", tags=["inflammation"])


@router.get("", response_model=InflammationResponse)
async def read_inflammation(
    user_id: str,
    target_date: date | None = None,
    db=Depends(get_db),
) -> InflammationResponse:
    repo = InflammationRepository(db)
    if not await repo.user_exists(user_id):
        raise HTTPException(status_code=404, detail="User not found")

    service = InflammationService(repo)
    return await service.get_for_day(user_id, target_date or datetime.now(timezone.utc).date())