# DB access for onboarding/lifestyle survey records
"""
Real DB-backed access to Lifestyle records. Same BaseRepository contract as
mock_lifestyle_repository.py, but against the redesigned schema (see
schemas/lifestyle.py) — birth_date/stress_level/etc., not the old
smoking_status/perceived_stress_level shape.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.lifestyle import Lifestyle
from app.repository.base_repository import BaseRepository


def _to_dict(lifestyle: Lifestyle) -> dict:
    return {
        "user_id": str(lifestyle.user_id),
        "birth_date": lifestyle.birth_date,
        "biological_sex": lifestyle.biological_sex,
        "stress_level": lifestyle.stress_level,
        "smoking_frequency": lifestyle.smoking_frequency,
        "drinking_frequency": lifestyle.drinking_frequency,
        "diet": lifestyle.diet,
        "has_autoimmune_condition": lifestyle.has_autoimmune_condition,
        "sick_types": lifestyle.sick_types,
        "med_types": lifestyle.med_types,
        "tracked_markers": lifestyle.tracked_markers,
        "healthkit_permissions": lifestyle.healthkit_permissions,
    }


class LifestyleRepository(BaseRepository[dict]):
    def __init__(self, db: Session):
        self.db = db

    def get(self, id: str) -> dict | None:
        row = self.db.execute(
            select(Lifestyle).where(Lifestyle.user_id == id)
        ).scalar_one_or_none()
        return _to_dict(row) if row else None

    def get_all(self) -> list[dict]:
        rows = self.db.execute(select(Lifestyle)).scalars().all()
        return [_to_dict(r) for r in rows]

    def create(self, data: dict) -> dict:
        row = Lifestyle(
            id=uuid.uuid4(),
            user_id=data["user_id"],
            birth_date=data["birth_date"],
            biological_sex=data["biological_sex"],
            stress_level=data["stress_level"],
            smoking_frequency=data["smoking_frequency"],
            drinking_frequency=data["drinking_frequency"],
            diet=data["diet"],
            has_autoimmune_condition=data["has_autoimmune_condition"],
            sick_types=data["sick_types"],
            med_types=data["med_types"],
            tracked_markers=data["tracked_markers"],
            healthkit_permissions=data["healthkit_permissions"],
            updated_at=datetime.now(timezone.utc),
        )
        self.db.add(row)
        self.db.flush()
        return _to_dict(row)

    def update(self, id: str, data: dict) -> dict | None:
        row = self.db.execute(
            select(Lifestyle).where(Lifestyle.user_id == id)
        ).scalar_one_or_none()
        if row is None:
            return None
        for field in (
            "birth_date", "biological_sex", "stress_level", "smoking_frequency",
            "drinking_frequency", "diet", "has_autoimmune_condition",
            "sick_types", "med_types", "tracked_markers", "healthkit_permissions",
        ):
            if field in data:
                setattr(row, field, data[field])
        row.updated_at = datetime.now(timezone.utc)
        self.db.flush()
        return _to_dict(row)