from datetime import datetime

from pydantic import BaseModel


class InflammationResponse(BaseModel):
    user_id: str
    score: float
    level: int  # 1-5, where 1 = no inflammation, 5 = very high
    insight: str
    computed_at: datetime
