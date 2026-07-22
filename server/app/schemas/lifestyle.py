from pydantic import BaseModel


class LifestyleProfileCreate(BaseModel):
    diet: str  # "very_unhealthy" | "unhealthy" | "moderate" | "healthy" | "very_healthy"
    has_autoimmune_condition: bool
    smoking_status: str  # "never" | "former" | "current"
    alcohol_consumption: str  # "none" | "light" | "moderate" | "heavy"
    medications: list[str]
    activity_level: str  # "sedentary" | "light" | "moderate" | "active" | "very_active"
    perceived_stress_level: int  # 1-10
    works_shift_work: bool
    family_history_autoimmune: bool
    currently_in_flare: bool


class LifestyleProfileResponse(LifestyleProfileCreate):
    user_id: str
