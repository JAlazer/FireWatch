# DB table definition for Lifestyle survey answers
import uuid

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID

from app.db.base import Base


class Lifestyle(Base):
    """
    Matches firewatch-schema.mermaid's LIFESTYLE table, PLUS
    has_autoimmune_condition — this resolves the schema gap flagged
    repeatedly in client types/api.ts and app/data/mock_data.py: it's now a
    real column rather than an open decision. (The diagram itself should get
    updated to match, if it hasn't been already.)
    """

    __tablename__ = "lifestyle"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)

    birth_date = Column(Date, nullable=False)
    biological_sex = Column(String, nullable=False)
    stress_level = Column(String, nullable=False)
    smoking_frequency = Column(String, nullable=False)
    drinking_frequency = Column(String, nullable=False)
    diet = Column(String, nullable=False, default="moderate")
    has_autoimmune_condition = Column(Boolean, nullable=False, default=False)

    sick_types = Column(ARRAY(String), nullable=False, default=list)
    med_types = Column(ARRAY(String), nullable=False, default=list)
    tracked_markers = Column(ARRAY(String), nullable=False, default=list)
    healthkit_permissions = Column(JSONB, nullable=False, default=dict)

    updated_at = Column(DateTime(timezone=True), nullable=False)