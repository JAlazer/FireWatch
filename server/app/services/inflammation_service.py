from datetime import datetime

from fastapi import HTTPException

from app.repository.base_repository import BaseRepository
from app.schemas.biometrics import BiometricsCreate
from app.schemas.inflammation import InflammationResponse
from app.services import baseline_service

# Metrics where higher values are healthier — z-scores for these are negated
# so all directed z-scores point in the "more inflammation" direction.
_GOOD_WHEN_HIGH = {"hrv", "spo2", "sleep_hours"}

_WEIGHTS: dict[str, float] = {
    "hrv": 2.0,  # primary signal per PROJECT_VISION.md
    "resting_heart_rate": 1.0,
    "skin_temperature": 1.0,
    "respiratory_rate": 1.0,
    "spo2": 1.0,
    "sleep_hours": 1.0,
}
_TOTAL_WEIGHT = sum(_WEIGHTS.values())

_METRIC_LABELS: dict[str, str] = {
    "hrv": "heart rate variability",
    "resting_heart_rate": "resting heart rate",
    "skin_temperature": "skin temperature",
    "respiratory_rate": "respiratory rate",
    "spo2": "blood oxygen",
    "sleep_hours": "sleep duration",
}


def _score_to_level(score: float) -> int:
    if score < -0.5:
        return 1
    if score < 0.0:
        return 2
    if score < 0.5:
        return 3
    if score < 1.0:
        return 4
    return 5


def _driver_phrase(metric: str) -> str:
    label = _METRIC_LABELS[metric]
    if metric in _GOOD_WHEN_HIGH:
        return f"low {label}"
    return f"elevated {label}"


def _build_insight(directed_z: dict[str, float], level: int) -> str:
    top_drivers = [m for m, z in sorted(directed_z.items(), key=lambda kv: kv[1], reverse=True) if z > 0.3][:2]
    if not top_drivers:
        return "Your biometric markers are within a healthy range."
    phrases = " and ".join(_driver_phrase(m) for m in top_drivers)
    if level <= 2:
        return f"Slight deviation detected — {phrases}. Monitor for changes."
    if level == 3:
        return f"{phrases.capitalize()} is contributing to a moderate inflammation signal."
    return f"{phrases.capitalize()} is the primary driver of your inflammation score."


def get_inflammation_score(user_id: str, biometrics_repo: BaseRepository) -> InflammationResponse:
    raw = biometrics_repo.get(user_id)
    if raw is None:
        raise HTTPException(status_code=404, detail="Biometrics not found for user")

    biometrics_fields = set(BiometricsCreate.model_fields.keys())
    biometrics = BiometricsCreate(**{k: raw[k] for k in biometrics_fields if k in raw})

    z_scores = baseline_service.compute_z_scores(biometrics)
    directed_z = {
        field: (-z if field in _GOOD_WHEN_HIGH else z)
        for field, z in z_scores.items()
    }

    composite = sum(_WEIGHTS[f] * z for f, z in directed_z.items()) / _TOTAL_WEIGHT
    level = _score_to_level(composite)
    insight = _build_insight(directed_z, level)

    return InflammationResponse(
        user_id=user_id,
        score=round(composite, 3),
        level=level,
        insight=insight,
        computed_at=datetime.utcnow(),
    )
