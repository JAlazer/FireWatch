# Real DB-backed access to Biometrics history
"""
Real DB-backed access to Biometrics samples. Batches through
BaseRepository's single-dict-in/single-dict-out contract by wrapping a LIST
of samples inside one dict (data["samples"]) — create() still satisfies the
ABC signature, it just happens to insert many rows from one call, matching
the redesigned BiometricsCreate (see schemas/biometrics.py's docstring for
why the old wide-row shape couldn't do this at all).
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.biometrics import Biometrics
from app.repository.base_repository import BaseRepository


def _to_dict(sample: Biometrics) -> dict:
    return {
        "id": str(sample.id),
        "user_id": str(sample.user_id),
        "healthkit_sample_uuid": sample.healthkit_sample_uuid,
        "metric_type": sample.metric_type,
        "value_numeric": sample.value_numeric,
        "value_category": sample.value_category,
        "unit": sample.unit,
        "start_at": sample.start_at,
        "end_at": sample.end_at,
        "created_at": sample.created_at,
        "received_at": sample.received_at,
        "source": sample.source,
    }


class BiometricsRepository(BaseRepository[dict]):
    def __init__(self, db: Session):
        self.db = db

    def get(self, id: str) -> dict | None:
        """`id` here is a user_id, matching the controller's
        GET /users/{user_id}/biometrics — not a sample id. Returns the most
        recent sample PER metric_type (a snapshot), not full history; see
        schemas/biometrics.py's note on that limitation."""
        rows = self.db.execute(
            select(Biometrics)
            .where(Biometrics.user_id == id, Biometrics.deleted_at.is_(None))
            .order_by(Biometrics.metric_type, Biometrics.start_at.desc())
        ).scalars().all()

        latest_by_metric: dict[str, Biometrics] = {}
        for row in rows:
            if row.metric_type not in latest_by_metric:  # first hit per type = most recent, given ORDER BY
                latest_by_metric[row.metric_type] = row

        if not latest_by_metric:
            return None
        return {"user_id": id, "samples": [_to_dict(s) for s in latest_by_metric.values()]}

    def get_all(self) -> list[dict]:
        # Not meaningful for a per-user snapshot resource — no controller
        # route calls this today. Raising rather than silently returning
        # something wrong if that changes.
        raise NotImplementedError("get_all() has no defined meaning for biometrics; query by user instead")

    def create(self, data: dict) -> dict:
        """data = {"user_id": ..., "samples": [BiometricSample dicts]}."""
        user_id = data["user_id"]
        now = datetime.now(timezone.utc)
        rows = []
        for s in data["samples"]:
            row = Biometrics(
                id=uuid.uuid4(),
                user_id=user_id,
                healthkit_sample_uuid=s.get("healthkit_sample_uuid") or str(uuid.uuid4()),
                metric_type=s["metric_type"],
                value_numeric=s.get("value_numeric"),
                value_category=s.get("value_category"),
                unit=s.get("unit"),
                start_at=s["start_at"],
                end_at=s.get("end_at"),
                created_at=now,
                received_at=now,
                source=s.get("source", "healthkit"),
            )
            self.db.add(row)
            rows.append(row)
        self.db.flush()
        return {"user_id": user_id, "samples": [_to_dict(r) for r in rows]}

    def update(self, id: str, data: dict) -> dict | None:
        # No update semantics defined yet for individual samples (soft-
        # delete via deleted_at is a separate concern from this ABC's
        # update()). Not wired to any route today.
        raise NotImplementedError("update() is not defined for biometrics samples yet")