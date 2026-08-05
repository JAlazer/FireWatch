"""
Data access for INFLAMMATION_SCORES, plus the two BIOMETRICS lookups the
scoring service needs (a cheap day-count for the calibrating check, and the
actual samples for score_series()).

ASSUMPTION: follows an async-SQLAlchemy-session-passed-in pattern (not held
across requests) — adjust signatures to match your actual repository base
class/convention if this guesses wrong. Also assumes a Biometrics model at
app.models.biometrics with columns matching firewatch-schema.mermaid
(user_id, metric_type, value_numeric, start_at, deleted_at) — swap the
import path if yours differs.
"""

from datetime import date, datetime
from typing import Any

from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.biometrics import Biometrics
from app.models.inflammation import InflammationScore


class InflammationRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, user_id: str, metric_date: date) -> InflammationScore | None:
        result = await self.db.execute(
            select(InflammationScore).where(
                InflammationScore.user_id == user_id,
                InflammationScore.metric_date == metric_date,
            )
        )
        return result.scalar_one_or_none()

    async def get_range(self, user_id: str, start: date, end: date) -> list[InflammationScore]:
        result = await self.db.execute(
            select(InflammationScore)
            .where(
                InflammationScore.user_id == user_id,
                InflammationScore.metric_date >= start,
                InflammationScore.metric_date <= end,
            )
            .order_by(InflammationScore.metric_date)
        )
        return list(result.scalars().all())

    async def upsert(
        self,
        user_id: str,
        metric_date: date,
        score: float,
        status: str,
        insight_text: str | None,
        computed_at: datetime,
    ) -> InflammationScore:
        existing = await self.get(user_id, metric_date)
        if existing:
            existing.score = score
            existing.status = status
            existing.insight_text = insight_text
            existing.computed_at = computed_at
        else:
            existing = InflammationScore(
                user_id=user_id,
                metric_date=metric_date,
                score=score,
                status=status,
                insight_text=insight_text,
                computed_at=computed_at,
            )
            self.db.add(existing)
        await self.db.flush()
        return existing

    async def count_distinct_days(
        self, user_id: str, metric_types: list[str], start: date, end: date,
    ) -> int:
        """Cheap existence check for the calibrating-vs-not decision — does
        NOT run scoring, just counts days that have at least one sample of
        any of `metric_types` in the lookback window."""
        result = await self.db.execute(
            select(func.count(distinct(func.date(Biometrics.start_at)))).where(
                Biometrics.user_id == user_id,
                Biometrics.metric_type.in_(metric_types),
                Biometrics.start_at >= start,
                Biometrics.start_at <= end,
                Biometrics.deleted_at.is_(None),
            )
        )
        return result.scalar_one() or 0

    async def get_samples_for_scoring(
        self, user_id: str, metric_type: str, start: date, end: date,
    ) -> list[dict[str, Any]]:
        """Rows shaped for app/ml/inflammation_scoring.py's daily_means() —
        {"start_at": datetime, "value": float}."""
        result = await self.db.execute(
            select(Biometrics.start_at, Biometrics.value_numeric).where(
                Biometrics.user_id == user_id,
                Biometrics.metric_type == metric_type,
                Biometrics.start_at >= start,
                Biometrics.start_at <= end,
                Biometrics.deleted_at.is_(None),
            )
        )
        return [{"start_at": row.start_at, "value": row.value_numeric} for row in result.all()]