"""
SQLAlchemy model for INFLAMMATION_SCORES (firewatch-schema.mermaid).

ASSUMPTION FLAGGED: the mermaid diagram marks `metric_date` alone as PK,
which can't be literally right on its own (two different users would
collide on the same date) — same pattern as BIOMETRICS marking both `id`
and `start_at` as PK to mean a composite key, per your own earlier note on
that table. Modeled here as composite PK (user_id, metric_date). Flag this
to whoever owns the diagram if a single-column PK was actually intended
(which would imply this table can only ever hold one user's history, so
almost certainly not).

No separate `id` column: unlike BIOMETRICS (which needs one purely to
satisfy TimescaleDB's hypertable partitioning constraint), this table isn't
a hypertable, so the natural composite key is sufficient on its own.

ASSUMPTION: imports Base from app.db.base — adjust to match wherever your
declarative Base actually lives.
"""

from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base


class InflammationScore(Base):
    __tablename__ = "inflammation_scores"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    metric_date = Column(Date, primary_key=True)
    score = Column(Float, nullable=False)
    status = Column(String, nullable=False)  # "low" | "moderate" | "high"
    insight_text = Column(String, nullable=True)
    computed_at = Column(DateTime(timezone=True), nullable=False)