from datetime import datetime

from pydantic import BaseModel


class BiometricsCreate(BaseModel):
    hrv: float
    resting_heart_rate: int
    skin_temperature: float
    respiratory_rate: float
    spo2: float
    sleep_hours: float  # weekly average in hours


class BiometricsResponse(BiometricsCreate):
    user_id: str
    recorded_at: datetime
