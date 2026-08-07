import statistics
from typing import Callable

from app.data.mock_data import mock_users as _population
from app.schemas.biometrics import BiometricsCreate

# Maps schema field names to their extractor from mock_data.py Biometrics dataclass.
# mock_data.py uses camelCase; our schema uses snake_case.
_FIELD_EXTRACTORS: dict[str, Callable] = {
    "hrv": lambda b: b.heartRateVariability,
    "resting_heart_rate": lambda b: b.restingHeartRate,
    "skin_temperature": lambda b: b.skinTemperature,
    "respiratory_rate": lambda b: b.respiratoryRate,
    "spo2": lambda b: b.bloodOxygenSaturation,
    "sleep_hours": lambda b: b.sleepTimeAverage,
}

# Compute population mean + stdev once at import time from the 18-user reference set.
_stats: dict[str, tuple[float, float]] = {}
for _field, _extract in _FIELD_EXTRACTORS.items():
    _values = [_extract(u.biometrics) for u in _population]
    _stats[_field] = (statistics.mean(_values), statistics.stdev(_values))


def compute_z_scores(biometrics: BiometricsCreate) -> dict[str, float]:
    raw = biometrics.model_dump()
    return {
        field: (raw[field] - mean) / stdev
        for field, (mean, stdev) in _stats.items()
    }
