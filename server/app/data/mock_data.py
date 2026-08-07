"""
Consolidated mock data for FireWatch, aligned to firewatch-schema.mermaid.

This REPLACES both:
  - mock_data.py    (old camelCase dataclasses, wide-row biometrics)
  - mock_users.py   (old dict-based users, wide-row biometrics)

Key change from both predecessors: BIOMETRICS is no longer one wide row per
user (hrv=72, resting_heart_rate=54, ...). The schema models it as a
HealthKit-style hypertable: one row PER SAMPLE, keyed by
(user_id, healthkit_sample_uuid), with a `metric_type` discriminator and a
flexible `value` jsonb. So instead of a `Biometrics` object per user, there's
a flat list of individual readings.

Scope for now: 3 seeded users x 1 day of samples across the "core" HealthKit
metric types agreed on: hrv, resting_hr, spo2, body_temp, resp_rate, steps,
sleep_stage. cycle_flow / cramps / vo2max / height / weight are supported by
the schema's design but intentionally left out of this seed set.

ASSUMPTIONS TO VERIFY against your actual onboarding code / Pydantic schemas
(I don't have onboarding/index.tsx's mapping helpers or app/schemas/*.py in
front of me, so I made reasonable placeholder choices):
  - `stress_level`, `smoking_frequency`, `drinking_frequency` string values
    below (e.g. "low"/"moderate"/"high") are guesses at your chip labels.
    Swap these for whatever your mapping helpers actually emit.
  - `diet` is left at "moderate" for every user, matching the schema's own
    note that it's a placeholder default with no onboarding question yet.
    Once you add the diet question, this is the field to start varying.
  - `biological_sex` uses Apple HealthKit's vocabulary: "female" | "male" |
    "other" | "not_applicable".
  - SpO2 is stored as a 0-1 fraction (HealthKit convention), not 0-100.
  - Wrist skin temperature is stored in degrees Celsius (HealthKit convention
    for appleSleepingWristTemperature), not Fahrenheit.
"""

import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from app.ml.inflammation_score import score_series

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
USER_ID_JOHAN = _uid("user", "johan")

MOCK_USERS: dict[str, dict[str, Any]] = {
    USER_ID_MAYA: {
        "user": {
            "id": USER_ID_MAYA,
            "clerk_user_id": "user_2mockClerkMaya",
            "email": "maya.chen@example.com",
            "created_at": datetime(2025, 1, 15, 9, 0, 0, tzinfo=timezone.utc),
            "first_name": "Maya",
            "last_name": "Spear"
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
            "first_name": "James",
            "last_name": "Beast"
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
            "first_name": "Sofia",
            "last_name": "First"
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
    USER_ID_JOHAN: {
        "user": {
            "id": USER_ID_JOHAN,
            "clerk_user_id": "user_2mockClerkJohan",
            "email": "johan@example.com",
            "created_at": datetime(2026, 7, 31, 0, 0, 0, tzinfo=timezone.utc),
            "first_name": "Johan",
            "last_name": "Almanzar Nunez"
        },
        "lifestyle": {
            "id": _uid("lifestyle", "johan"),
            "user_id": USER_ID_JOHAN,
            # PLACEHOLDER — scripts/parse_healthkit_export.py prints your
            # actual birth date + biological sex from the <Me> element in
            # export.xml. Swap these two for whatever it reports.
            "birth_date": date(1994, 1, 1),
            "biological_sex": "not_applicable",
            # PLACEHOLDER — HealthKit export data has no way to tell us
            # these; they're the same onboarding questions from
            # onboarding/index.tsx. Replace with your real answers.
            "stress_level": "moderate",
            "smoking_frequency": "never",
            "drinking_frequency": "never",
            "diet": "moderate",
            "has_autoimmune_condition": False,
            "sick_types": [],
            "med_types": [],
            # All 7 core metric types, since real export data typically has
            # coverage across all of them (unlike the synthetic 3-user set
            # above, which varies coverage deliberately for test cases).
            "tracked_markers": [
                "hrv", "resting_hr", "spo2", "body_temp", "resp_rate",
                "steps", "sleep_stage",
            ],
            "healthkit_permissions": {
                "hrv": True, "resting_hr": True, "spo2": True,
                "body_temp": True, "resp_rate": True, "steps": True,
                "sleep_stage": True, "cycle_flow": False, "cramps": False,
            },
            "updated_at": datetime(2026, 7, 31, 0, 0, 0, tzinfo=timezone.utc),
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
    value: float | str,
    unit: str | None,
    start_at: datetime,
    end_at: datetime | None,
    received_at: datetime,
    source: str = "healthkit",
    deleted_at: datetime | None = None,
    sample_suffix: str = "",
) -> dict[str, Any]:
    """value is either a float (populates value_numeric) or a string
    (populates value_category, e.g. sleep_stage's "asleep_core") — matching
    firewatch-schema.mermaid's split columns, not the earlier single jsonb
    `value` field this helper used before the schema evolved."""
    is_category = isinstance(value, str)
    return {
        "id": _uid("biometric", user_id, metric_type, sample_suffix or start_at.isoformat()),
        "user_id": user_id,
        "healthkit_sample_uuid": _uid(
            "hk-sample", user_id, metric_type, sample_suffix or start_at.isoformat()
        ),
        "metric_type": metric_type,
        "value_numeric": None if is_category else float(value),
        "value_category": value if is_category else None,
        "unit": unit,
        "start_at": start_at,
        "end_at": end_at,
        "created_at": received_at,  # mock data: row insert time == ingestion time
        "received_at": received_at,
        "deleted_at": deleted_at,
        "source": source,
    }


MOCK_BIOMETRICS: list[dict[str, Any]] = [
    # ---- Maya (healthy, low inflammation) ----
    _sample(USER_ID_MAYA, "hrv", 72.4, "ms", _at(7, 15), None, _at(7, 17)),
    _sample(USER_ID_MAYA, "resting_hr", 54, "count/min", _at(7, 15), None, _at(7, 17)),
    _sample(USER_ID_MAYA, "spo2", 0.98, "%", _at(3, 0), None, _at(7, 17)),
    _sample(USER_ID_MAYA, "body_temp", 33.6, "degC", _at(3, 0), None, _at(7, 17)),
    _sample(USER_ID_MAYA, "resp_rate", 13.2, "count/min", _at(3, 0), None, _at(7, 17)),
    _sample(
        USER_ID_MAYA, "steps", 11200, "count",
        _at(0, 0), _at(23, 59), _at(23, 59),
    ),
    _sample(
        USER_ID_MAYA, "sleep_stage", "asleep_core", None,
        _at(0, 0), _at(2, 10), _at(7, 17), sample_suffix="segment_1",
    ),
    _sample(
        USER_ID_MAYA, "sleep_stage", "asleep_deep", None,
        _at(2, 10), _at(4, 0), _at(7, 17), sample_suffix="segment_2",
    ),
    _sample(
        USER_ID_MAYA, "sleep_stage", "asleep_rem", None,
        _at(4, 0), _at(6, 30), _at(7, 17), sample_suffix="segment_3",
    ),
    # Soft-deleted duplicate — exercises the HealthKit "anchored query"
    # delete/dedup path: a duplicate hrv sample synced twice, second one
    # later marked deleted by the client.
    _sample(
        USER_ID_MAYA, "hrv", 72.4, "ms", _at(7, 15), None, _at(7, 18),
        deleted_at=_at(8, 0), sample_suffix="duplicate",
    ),

    # ---- James (moderate risk, some inflammation drivers) ----
    _sample(USER_ID_JAMES, "hrv", 38.1, "ms", _at(6, 45), None, _at(6, 50)),
    # Watch battery died overnight — resting_hr entered manually instead.
    _sample(
        USER_ID_JAMES, "resting_hr", 74, "count/min", _at(6, 45), None,
        _at(9, 0), source="manual",
    ),
    _sample(USER_ID_JAMES, "spo2", 0.95, "%", _at(2, 30), None, _at(6, 50)),
    _sample(USER_ID_JAMES, "body_temp", 34.1, "degC", _at(2, 30), None, _at(6, 50)),
    _sample(USER_ID_JAMES, "resp_rate", 17.0, "count/min", _at(2, 30), None, _at(6, 50)),
    _sample(
        USER_ID_JAMES, "steps", 4200, "count",
        _at(0, 0), _at(23, 59), _at(23, 59),
    ),
    _sample(
        USER_ID_JAMES, "sleep_stage", "asleep_core", None,
        _at(0, 30), _at(3, 0), _at(6, 50), sample_suffix="segment_1",
    ),
    _sample(
        USER_ID_JAMES, "sleep_stage", "awake", None,
        _at(3, 0), _at(3, 20), _at(6, 50), sample_suffix="segment_2",
    ),
    _sample(
        USER_ID_JAMES, "sleep_stage", "asleep_core", None,
        _at(3, 20), _at(5, 30), _at(6, 50), sample_suffix="segment_3",
    ),

    # ---- Sofia (autoimmune, in flare as of MOCK_DAY, high inflammation) ----
    _sample(USER_ID_SOFIA, "hrv", 18.3, "ms", _at(5, 50), None, _at(5, 55)),
    _sample(USER_ID_SOFIA, "resting_hr", 88, "count/min", _at(5, 50), None, _at(5, 55)),
    _sample(USER_ID_SOFIA, "spo2", 0.91, "%", _at(1, 45), None, _at(5, 55)),
    _sample(USER_ID_SOFIA, "body_temp", 35.0, "degC", _at(1, 45), None, _at(5, 55)),
    _sample(USER_ID_SOFIA, "resp_rate", 21.4, "count/min", _at(1, 45), None, _at(5, 55)),
    _sample(
        USER_ID_SOFIA, "steps", 1500, "count",
        _at(0, 0), _at(23, 59), _at(23, 59),
    ),
    _sample(
        USER_ID_SOFIA, "sleep_stage", "awake", None,
        _at(0, 0), _at(0, 45), _at(5, 55), sample_suffix="segment_1",
    ),
    _sample(
        USER_ID_SOFIA, "sleep_stage", "asleep_core", None,
        _at(0, 45), _at(2, 0), _at(5, 55), sample_suffix="segment_2",
    ),
    _sample(
        USER_ID_SOFIA, "sleep_stage", "awake", None,
        _at(2, 0), _at(2, 40), _at(5, 55), sample_suffix="segment_3",
    ),
]

# ---------------------------------------------------------------------------
# BACKFILL: daily hrv + resting_hr history, so score_series has enough to
# work with
# ---------------------------------------------------------------------------
# inflammation_scoring.Scoring needs BASELINE_MIN_DAYS(28) + ROLL_DAYS(3) =
# ~31 consecutive days of BOTH signals before it exits "calibrating" for a
# given day. The single MOCK_DAY samples above are realistic in DETAIL (all
# 7 metrics, a soft-deleted duplicate, a manual entry) but alone can never
# produce a "scored" result — there's only one day. This backfills the
# WINDOW_DAYS days before MOCK_DAY with just hrv + resting_hr (the only two
# signals score_series reads), so at least the most recent days actually
# clear "calibrating".
#
# This is a simplified stand-in for the real generator (src/mock/generate.ts
# does true AR(1) latent series + an Ornstein-Uhlenbeck process for HR) — it
# exists to unblock testing the inflammation endpoint against realistic
# VOLUME and TIMING, not to replace that generator. Swap this block out once
# there's a Python (or Node-bridged) equivalent of generate() available.

import random as _random  # noqa: E402 (deliberately after the module's main imports)

WINDOW_DAYS = 45  # leaves ~14 "scored"-eligible days ending on MOCK_DAY


def _backfill_hrv_rhr(
    user_id: str,
    seed: str,
    hrv_baseline: float,
    rhr_baseline: float,
    flare_days: set[int] | None = None,
    flare_hrv_factor: float = 0.749,  # RA Forecast Study 2026, per mapping.ts
    flare_rhr_factor: float = 1.086,
) -> list[dict[str, Any]]:
    """Days -WINDOW_DAYS+1 .. -1 relative to MOCK_DAY (MOCK_DAY's own hrv/
    resting_hr samples are already in MOCK_BIOMETRICS above, so this stops
    at day -1). `flare_days` is a set of negative day offsets (e.g.
    {-11..0}) where the flare factors apply, mirroring mapping.ts's
    multiplicative episode effects — NOT a fresh set of assumptions."""
    rng = _random.Random(seed)
    out: list[dict[str, Any]] = []
    for offset in range(-WINDOW_DAYS + 1, 0):
        day = MOCK_DAY + timedelta(days=offset)
        in_flare = flare_days is not None and offset in flare_days
        hrv = hrv_baseline * (flare_hrv_factor if in_flare else 1.0) * rng.gauss(1.0, 0.08)
        rhr = rhr_baseline * (flare_rhr_factor if in_flare else 1.0) * rng.gauss(1.0, 0.04)
        t = datetime(day.year, day.month, day.day, 7, 15, tzinfo=timezone.utc)
        out.append(_sample(user_id, "hrv", round(hrv, 1), "ms", t, None, t, sample_suffix=f"backfill_{offset}"))
        out.append(_sample(
            user_id, "resting_hr", round(rhr, 1), "count/min", t, None, t,
            sample_suffix=f"backfill_{offset}",
        ))
    return out


# Maya: stable, healthy baseline — no flare, should end MOCK_DAY "scored", calm.
MOCK_BIOMETRICS += _backfill_hrv_rhr(USER_ID_MAYA, "backfill:maya", hrv_baseline=72.4, rhr_baseline=54)

# James: stable, moderate-risk baseline — no flare, no autoimmune condition,
# should also end MOCK_DAY "scored", calm (elevated lifestyle risk factors
# aren't something score_series looks at at all — it only reads HRV/RHR).
MOCK_BIOMETRICS += _backfill_hrv_rhr(USER_ID_JAMES, "backfill:james", hrv_baseline=38.1, rhr_baseline=74)

# Sofia: remission baseline for most of the window, then an autoimmune flare
# for the 12 days through and including MOCK_DAY (offset 0) — so as of
# MOCK_DAY she should land "scored", elevated, high severity. Remission
# baseline is back-derived from the flare factors so MOCK_DAY's own values
# (already in MOCK_BIOMETRICS as 18.3ms / 88bpm) land close to what this
# backfill would produce on a flare day, for continuity.
MOCK_BIOMETRICS += _backfill_hrv_rhr(
    USER_ID_SOFIA, "backfill:sofia",
    hrv_baseline=18.3 / 0.749, rhr_baseline=88 / 1.086,
    flare_days=set(range(-11, 1)),  # -11..0 inclusive: 12-day flare ending today
)

# ---- Johan (real HealthKit export) ----
# Run scripts/parse_healthkit_export.py against your export.xml, paste the
# printed MOCK_BIOMETRICS_JOHAN list here (or `import` it and concatenate —
# see the script's docstring for both options). Left empty means Johan
# currently has zero biometric samples, which is a valid state (a
# just-onboarded user before any HealthKit sync) — inflammation scoring
# below handles that by returning a neutral 3.0 rather than erroring.
MOCK_BIOMETRICS_JOHAN: list[dict[str, Any]] = []

MOCK_BIOMETRICS = MOCK_BIOMETRICS + MOCK_BIOMETRICS_JOHAN


# ---------------------------------------------------------------------------
# INFLAMMATION_SCORES
# ---------------------------------------------------------------------------
# Sparse by design (per app/services/inflammation_service.py): a row exists
# ONLY for (user, day) pairs where score_series actually returns "scored" —
# there is deliberately no row, not even a placeholder, for calibrating
# days. A brand-new user (or Johan, with zero backfilled history) simply
# has no rows here yet, matching what GET /inflammation's calibrating-path
# response looks like against a real, freshly-seeded database.

# Mirrors app/services/inflammation_service.py's _STATUS_LABELS. Duplicated
# here (rather than imported) so this data module doesn't pull in the
# services/repository/DB import chain just to build fixtures — keep these
# two mappings in sync by hand if the split ever changes.
_STATUS_LABELS = {1: "low", 2: "low", 3: "moderate", 4: "high", 5: "high"}


def _build_inflammation_scores(
    samples: list[dict[str, Any]],
    users: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    scores: list[dict[str, Any]] = []
    for user_id in users:
        hrv_samples = [
            s for s in samples
            if s["user_id"] == user_id and s["metric_type"] == "hrv" and not s["deleted_at"]
        ]
        rhr_samples = [
            s for s in samples
            if s["user_id"] == user_id and s["metric_type"] == "resting_hr" and not s["deleted_at"]
        ]
        if not hrv_samples or not rhr_samples:
            continue  # e.g. Johan, with no backfilled history yet — no rows, not zeros

        # scoring module wants {"start_at": datetime, "value": float}, not
        # the full BIOMETRICS row shape.
        hrv_input = [{"start_at": s["start_at"], "value": s["value_numeric"]} for s in hrv_samples]
        rhr_input = [{"start_at": s["start_at"], "value": s["value_numeric"]} for s in rhr_samples]

        earliest = min(s["start_at"] for s in hrv_samples + rhr_samples).date()
        results = score_series(hrv_input, rhr_input, earliest, MOCK_DAY)

        for r in results:
            if r.status != "scored":
                continue  # calibrating days get no row at all — see module note above
            scores.append({
                "user_id": user_id,
                "metric_date": r.day,
                "score": r.score,
                "status": _STATUS_LABELS[r.level],
                "insight_text": None,  # LLM insight generation is a separate concern
                "computed_at": datetime.combine(r.day, time(23, 59), tzinfo=timezone.utc),
            })
    return scores


MOCK_INFLAMMATION_SCORES: list[dict[str, Any]] = _build_inflammation_scores(
    MOCK_BIOMETRICS, MOCK_USERS
)