
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any
 
# ---------------------------------------------------------------------------
# Deterministic UUID helper
# ---------------------------------------------------------------------------
# Using uuid5 (name-based) instead of uuid4 (random) so the mock dataset is
# stable across test runs / restarts of the in-memory mock repositories,
# without having to hardcode a wall of literal UUIDs.
 
_NAMESPACE = uuid.NAMESPACE_DNS
 
 
def _uid(*parts: str) -> str:
    return str(uuid.uuid5(_NAMESPACE, ":".join(parts)))
 
 
# ---------------------------------------------------------------------------
# Shared reference date for the single seeded day of biometrics
# ---------------------------------------------------------------------------
 
MOCK_DAY: date = date(2026, 7, 30)
 
 
def _at(hour: int, minute: int = 0) -> datetime:
    """UTC timestamp on MOCK_DAY. Real data would carry the user's local tz."""
    return datetime(
        MOCK_DAY.year, MOCK_DAY.month, MOCK_DAY.day, hour, minute, tzinfo=timezone.utc
    )
 
 
# ---------------------------------------------------------------------------
# USERS + LIFESTYLE
# ---------------------------------------------------------------------------
# Keyed by user_id (uuid string) so repositories can do MOCK_USERS[user_id]
# lookups directly, same access pattern as the old mock_users.py.
 
USER_ID_MAYA = _uid("user", "maya")
USER_ID_JAMES = _uid("user", "james")
USER_ID_SOFIA = _uid("user", "sofia")
 
MOCK_USERS: dict[str, dict[str, Any]] = {
    USER_ID_MAYA: {
        "user": {
            "id": USER_ID_MAYA,
            "clerk_user_id": "user_2mockClerkMaya",
            "email": "maya.chen@example.com",
            "created_at": datetime(2025, 1, 15, 9, 0, 0, tzinfo=timezone.utc),
        },
        "lifestyle": {
            "id": _uid("lifestyle", "maya"),
            "user_id": USER_ID_MAYA,
            "birth_date": date(1994, 6, 12),
            "biological_sex": "female",
            "stress_level": "low",
            "smoking_frequency": "never",
            "drinking_frequency": "never",
            "diet": "moderate",  # placeholder, see module docstring
            # Schema gap: not a real LIFESTYLE column in
            # firewatch-schema.mermaid yet. See the has_autoimmune_condition
            # comment in client types/api.ts for the open decision.
            "has_autoimmune_condition": False,
            "sick_types": [],
            "med_types": [],
            "tracked_markers": ["hrv", "resting_hr", "sleep_stage", "spo2"],
            "healthkit_permissions": {
                "hrv": True,
                "resting_hr": True,
                "spo2": True,
                "body_temp": True,
                "resp_rate": True,
                "steps": True,
                "sleep_stage": True,
                "cycle_flow": True,
                "cramps": False,
            },
            "updated_at": datetime(2025, 1, 15, 9, 5, 0, tzinfo=timezone.utc),
        },
    },
    USER_ID_JAMES: {
        "user": {
            "id": USER_ID_JAMES,
            "clerk_user_id": "user_2mockClerkJames",
            "email": "james.okafor@example.com",
            "created_at": datetime(2025, 2, 3, 14, 30, 0, tzinfo=timezone.utc),
        },
        "lifestyle": {
            "id": _uid("lifestyle", "james"),
            "user_id": USER_ID_JAMES,
            "birth_date": date(1988, 11, 2),
            "biological_sex": "male",
            "stress_level": "high",
            "smoking_frequency": "occasionally",
            "drinking_frequency": "weekly",
            "diet": "moderate",  # placeholder, see module docstring
            "has_autoimmune_condition": False,  # schema gap, see Maya's entry above
            "sick_types": ["seasonal_allergies"],
            "med_types": ["ibuprofen"],
            "tracked_markers": [
                "hrv",
                "resting_hr",
                "resp_rate",
                "sleep_stage",
                "stress_level",
            ],
            "healthkit_permissions": {
                "hrv": True,
                "resting_hr": True,
                "spo2": True,
                "body_temp": False,
                "resp_rate": True,
                "steps": True,
                "sleep_stage": True,
                "cycle_flow": False,
                "cramps": False,
            },
            "updated_at": datetime(2025, 2, 3, 14, 40, 0, tzinfo=timezone.utc),
        },
    },
    USER_ID_SOFIA: {
        "user": {
            "id": USER_ID_SOFIA,
            "clerk_user_id": "user_2mockClerkSofia",
            "email": "sofia.reyes@example.com",
            "created_at": datetime(2025, 3, 10, 11, 15, 0, tzinfo=timezone.utc),
        },
        "lifestyle": {
            "id": _uid("lifestyle", "sofia"),
            "user_id": USER_ID_SOFIA,
            "birth_date": date(1991, 4, 27),
            "biological_sex": "female",
            "stress_level": "high",
            "smoking_frequency": "daily",
            "drinking_frequency": "daily",
            "diet": "moderate",  # placeholder, see module docstring
            "has_autoimmune_condition": True,  # schema gap, see Maya's entry above
            "sick_types": ["rheumatoid_arthritis"],
            "med_types": ["methotrexate", "prednisone"],
            "tracked_markers": [
                "hrv",
                "resting_hr",
                "resp_rate",
                "spo2",
                "sleep_stage",
                "stress_level",
                "autoimmune_flare",
            ],
            "healthkit_permissions": {
                "hrv": True,
                "resting_hr": True,
                "spo2": True,
                "body_temp": True,
                "resp_rate": True,
                "steps": True,
                "sleep_stage": True,
                "cycle_flow": True,
                "cramps": True,
            },
            "updated_at": datetime(2025, 3, 10, 11, 20, 0, tzinfo=timezone.utc),
        },
    },
}
 
 
# ---------------------------------------------------------------------------
# BIOMETRICS
# ---------------------------------------------------------------------------
# Flat list of individual samples — mirrors how rows actually land in the
# hypertable. Each entry maps 1:1 to a BIOMETRICS row.
#
# `end_at` is None for point-in-time readings (hrv, resting_hr, spo2,
# body_temp, resp_rate), matching the schema's "nullable for instantaneous
# types" note. `steps` and `sleep_stage` are inherently windowed, so they
# carry a real start_at/end_at span.
 
 
def _sample(
    user_id: str,
    metric_type: str,
    value: dict[str, Any],
    start_at: datetime,
    end_at: datetime | None,
    received_at: datetime,
    source: str = "healthkit",
    deleted_at: datetime | None = None,
    sample_suffix: str = "",
) -> dict[str, Any]:
    return {
        "id": _uid("biometric", user_id, metric_type, sample_suffix or start_at.isoformat()),
        "user_id": user_id,
        "healthkit_sample_uuid": _uid(
            "hk-sample", user_id, metric_type, sample_suffix or start_at.isoformat()
        ),
        "metric_type": metric_type,
        "value": value,
        "start_at": start_at,
        "end_at": end_at,
        "received_at": received_at,
        "deleted_at": deleted_at,
        "source": source,
    }
 
 
MOCK_BIOMETRICS: list[dict[str, Any]] = [
    # ---- Maya (healthy, low inflammation) ----
    _sample(USER_ID_MAYA, "hrv", {"value": 72.4, "unit": "ms"}, _at(7, 15), None, _at(7, 17)),
    _sample(USER_ID_MAYA, "resting_hr", {"value": 54, "unit": "count/min"}, _at(7, 15), None, _at(7, 17)),
    _sample(USER_ID_MAYA, "spo2", {"value": 0.98, "unit": "%"}, _at(3, 0), None, _at(7, 17)),
    _sample(USER_ID_MAYA, "body_temp", {"value": 33.6, "unit": "degC"}, _at(3, 0), None, _at(7, 17)),
    _sample(USER_ID_MAYA, "resp_rate", {"value": 13.2, "unit": "count/min"}, _at(3, 0), None, _at(7, 17)),
    _sample(
        USER_ID_MAYA, "steps", {"value": 11200, "unit": "count"},
        _at(0, 0), _at(23, 59), _at(23, 59),
    ),
    _sample(
        USER_ID_MAYA, "sleep_stage", {"stage": "asleep_core", "unit": "stage"},
        _at(0, 0), _at(2, 10), _at(7, 17), sample_suffix="segment_1",
    ),
    _sample(
        USER_ID_MAYA, "sleep_stage", {"stage": "asleep_deep", "unit": "stage"},
        _at(2, 10), _at(4, 0), _at(7, 17), sample_suffix="segment_2",
    ),
    _sample(
        USER_ID_MAYA, "sleep_stage", {"stage": "asleep_rem", "unit": "stage"},
        _at(4, 0), _at(6, 30), _at(7, 17), sample_suffix="segment_3",
    ),
    # Soft-deleted duplicate — exercises the HealthKit "anchored query"
    # delete/dedup path: a duplicate hrv sample synced twice, second one
    # later marked deleted by the client.
    _sample(
        USER_ID_MAYA, "hrv", {"value": 72.4, "unit": "ms"}, _at(7, 15), None, _at(7, 18),
        deleted_at=_at(8, 0), sample_suffix="duplicate",
    ),
 
    # ---- James (moderate risk, some inflammation drivers) ----
    _sample(USER_ID_JAMES, "hrv", {"value": 38.1, "unit": "ms"}, _at(6, 45), None, _at(6, 50)),
    # Watch battery died overnight — resting_hr entered manually instead.
    _sample(
        USER_ID_JAMES, "resting_hr", {"value": 74, "unit": "count/min"}, _at(6, 45), None,
        _at(9, 0), source="manual",
    ),
    _sample(USER_ID_JAMES, "spo2", {"value": 0.95, "unit": "%"}, _at(2, 30), None, _at(6, 50)),
    _sample(USER_ID_JAMES, "body_temp", {"value": 34.1, "unit": "degC"}, _at(2, 30), None, _at(6, 50)),
    _sample(USER_ID_JAMES, "resp_rate", {"value": 17.0, "unit": "count/min"}, _at(2, 30), None, _at(6, 50)),
    _sample(
        USER_ID_JAMES, "steps", {"value": 4200, "unit": "count"},
        _at(0, 0), _at(23, 59), _at(23, 59),
    ),
    _sample(
        USER_ID_JAMES, "sleep_stage", {"stage": "asleep_core", "unit": "stage"},
        _at(0, 30), _at(3, 0), _at(6, 50), sample_suffix="segment_1",
    ),
    _sample(
        USER_ID_JAMES, "sleep_stage", {"stage": "awake", "unit": "stage"},
        _at(3, 0), _at(3, 20), _at(6, 50), sample_suffix="segment_2",
    ),
    _sample(
        USER_ID_JAMES, "sleep_stage", {"stage": "asleep_core", "unit": "stage"},
        _at(3, 20), _at(5, 30), _at(6, 50), sample_suffix="segment_3",
    ),
 
    # ---- Sofia (autoimmune, currently in flare, high inflammation) ----
    _sample(USER_ID_SOFIA, "hrv", {"value": 18.3, "unit": "ms"}, _at(5, 50), None, _at(5, 55)),
    _sample(USER_ID_SOFIA, "resting_hr", {"value": 88, "unit": "count/min"}, _at(5, 50), None, _at(5, 55)),
    _sample(USER_ID_SOFIA, "spo2", {"value": 0.91, "unit": "%"}, _at(1, 45), None, _at(5, 55)),
    _sample(USER_ID_SOFIA, "body_temp", {"value": 35.0, "unit": "degC"}, _at(1, 45), None, _at(5, 55)),
    _sample(USER_ID_SOFIA, "resp_rate", {"value": 21.4, "unit": "count/min"}, _at(1, 45), None, _at(5, 55)),
    _sample(
        USER_ID_SOFIA, "steps", {"value": 1500, "unit": "count"},
        _at(0, 0), _at(23, 59), _at(23, 59),
    ),
    _sample(
        USER_ID_SOFIA, "sleep_stage", {"stage": "awake", "unit": "stage"},
        _at(0, 0), _at(0, 45), _at(5, 55), sample_suffix="segment_1",
    ),
    _sample(
        USER_ID_SOFIA, "sleep_stage", {"stage": "asleep_core", "unit": "stage"},
        _at(0, 45), _at(2, 0), _at(5, 55), sample_suffix="segment_2",
    ),
    _sample(
        USER_ID_SOFIA, "sleep_stage", {"stage": "awake", "unit": "stage"},
        _at(2, 0), _at(2, 40), _at(5, 55), sample_suffix="segment_3",
    ),
]