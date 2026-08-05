from datetime import date

from pydantic import BaseModel


class LifestyleProfileCreate(BaseModel):
    """
    Matches client/app/onboarding/markers.tsx's lifestylePayload exactly —
    this REPLACES the previous version of this file, which was still the
    pre-redesign contract (smoking_status/perceived_stress_level/
    activity_level/etc.) from before the onboarding screens were rewritten
    to collect tiers/frequencies directly. The client already sends this
    shape; the server schema just never caught up until now.
    """

    birth_date: date
    biological_sex: str  # "female" | "male" | "other" | "not_applicable"
    stress_level: str  # "low" | "moderate" | "high"
    smoking_frequency: str  # "never" | "occasionally" | "daily" | "heavy"
    drinking_frequency: str  # "never" | "occasionally" | "weekly" | "daily"
    diet: str  # "very_unhealthy" | "unhealthy" | "moderate" | "healthy" | "very_healthy"
    has_autoimmune_condition: bool
    sick_types: list[str]
    med_types: list[str]
    tracked_markers: list[str]
    healthkit_permissions: dict[str, bool]


class LifestyleProfileResponse(LifestyleProfileCreate):
    user_id: str