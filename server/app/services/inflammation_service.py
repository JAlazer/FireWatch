"""
Inflammation service — two separate paths on purpose:

  get_for_day()  — the READ path. Fast: one row lookup, or (if not stored
                    yet) one cheap count query. Never runs score_series().
                    This is what the GET /inflammation endpoint calls.

  recompute()    — the WRITE path. Runs score_series() over the lookback
                    window and persists today's result if it's actually
                    "scored". This should be called from an
                    ingestion-triggered job or nightly cron — NOT from the
                    GET path, since re-walking 56+3 days of samples on every
                    request is wasted work when nothing's changed since the
                    last ingestion.
"""

from datetime import date, datetime, timedelta, timezone

from app.ml.inflammation_score import Scoring, score_series
from app.repository.inflammation_repo import InflammationRepository
from app.schemas.inflammation import InflammationResponse, InflammationStatus

# level -> human-facing bucket for the schema's `status` column. Not derived
# from score.ts (it doesn't define one) — a judgment call, flagged so it's a
# deliberate choice rather than an inherited default. Revisit if 2/3 feels
# like the wrong split once real data exists.
_STATUS_LABELS = {1: "low", 2: "low", 3: "moderate", 4: "high", 5: "high"}


def _status_label(level: int) -> str:
    return _STATUS_LABELS[level]


class InflammationService:
    def __init__(self, repo: InflammationRepository):
        self.repo = repo

    async def get_for_day(self, user_id: str, target_date: date) -> InflammationResponse:
        stored = await self.repo.get(user_id, target_date)
        if stored is not None:
            return InflammationResponse(
                user_id=user_id,
                date=target_date,
                status=InflammationStatus.scored,
                score=stored.score,
                status_label=stored.status,
                insight_text=stored.insight_text,
                days_of_history=Scoring.BASELINE_MIN_DAYS + Scoring.ROLL_DAYS,  # already past threshold
                days_until_scored=0,
                computed_at=stored.computed_at,
            )

        lookback_start = target_date - timedelta(days=Scoring.BASELINE_MAX_DAYS + Scoring.ROLL_DAYS)
        days_with_data = await self.repo.count_distinct_days(
            user_id, metric_types=["hrv", "resting_hr"], start=lookback_start, end=target_date,
        )
        days_needed = Scoring.BASELINE_MIN_DAYS + Scoring.ROLL_DAYS

        return InflammationResponse(
            user_id=user_id,
            date=target_date,
            status=InflammationStatus.calibrating,
            days_of_history=days_with_data,
            days_until_scored=max(0, days_needed - days_with_data),
        )

    async def recompute(self, user_id: str, target_date: date) -> InflammationResponse:
        lookback_start = target_date - timedelta(days=Scoring.BASELINE_MAX_DAYS + Scoring.ROLL_DAYS)
        hrv_samples = await self.repo.get_samples_for_scoring(user_id, "hrv", lookback_start, target_date)
        rhr_samples = await self.repo.get_samples_for_scoring(user_id, "resting_hr", lookback_start, target_date)

        result = score_series(hrv_samples, rhr_samples, target_date, target_date)[0]

        if result.status == "scored":
            await self.repo.upsert(
                user_id=user_id,
                metric_date=target_date,
                score=result.score,
                status=_status_label(result.level),
                insight_text=None,  # LLM insight generation is a separate concern from scoring
                computed_at=datetime.now(timezone.utc),
            )

        return await self.get_for_day(user_id, target_date)