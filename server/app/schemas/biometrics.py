"""
REDESIGNED, not patched. The previous BiometricsCreate (hrv, resting_
heart_rate, skin_temperature, respiratory_rate, spo2, sleep_hours as flat
fields on one record) has no valid mapping onto the real `biometrics`
table, which is EAV — one row per individual sample, per metric_type, with
typed value_numeric/value_category + unit columns. A single wide record
can't become "N rows with different metric_types" without a different
shape entirely.

CLIENT IMPACT, NOT YET DONE: client/services/api.ts's BiometricsCreate type
and markers.tsx's saveBiometrics() call still target the OLD wide shape.
They'll need updating to send a batch of samples matching this file, before
POST /users/{id}/biometrics actually works end-to-end from onboarding.
Flagging this rather than fixing it now, since it's a client-side change.
"""

from datetime import datetime

from pydantic import BaseModel


class BiometricSample(BaseModel):
    metric_type: str  # "hrv" | "resting_hr" | "spo2" | "body_temp" | "resp_rate" | "steps" | "sleep_stage"
    value_numeric: float | None = None  # exactly one of value_numeric/value_category is set
    value_category: str | None = None  # e.g. sleep_stage's "asleep_core"
    unit: str | None = None
    start_at: datetime
    end_at: datetime | None = None
    source: str = "healthkit"  # "healthkit" | "manual"
    # Client-generated, for the eventual anchored-query dedup path. Optional
    # for now since no real HealthKit ingestion exists yet to generate one.
    healthkit_sample_uuid: str | None = None


class BiometricsCreate(BaseModel):
    samples: list[BiometricSample]


class BiometricSampleResponse(BiometricSample):
    id: str
    user_id: str
    created_at: datetime
    received_at: datetime


class BiometricsResponse(BaseModel):
    # GET returns the MOST RECENT sample per metric_type — a convenience
    # snapshot, not the full history (there's no date-range/pagination
    # support yet; add query params to the controller when that's needed).
    user_id: str
    samples: list[BiometricSampleResponse]