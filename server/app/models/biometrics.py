# DB table definition for Biometrics records
import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Float, PrimaryKeyConstraint, String
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base


class Biometrics(Base):
    """
    Matches firewatch-schema.mermaid's BIOMETRICS table — the hypertable.

    Composite PK (id, start_at), NOT just id: TimescaleDB requires every
    unique/primary-key constraint on a hypertable to include the partition
    column (start_at). `id` alone would satisfy application-level uniqueness
    just fine; the composite exists purely to satisfy that constraint (per
    your own earlier note on this table).

    value_numeric / value_category (not a single jsonb `value`): typed
    columns compress far better under TimescaleDB's columnar compression
    (compress_segmentby on user_id+metric_type) and enforce type per metric,
    vs. jsonb which defeats both.
    """

    __tablename__ = "biometrics"
    __table_args__ = (PrimaryKeyConstraint("id", "start_at"),)

    id = Column(UUID(as_uuid=True), default=uuid.uuid4, nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    healthkit_sample_uuid = Column(String, nullable=False)
    metric_type = Column(String, nullable=False)

    value_numeric = Column(Float, nullable=True)
    value_category = Column(String, nullable=True)
    unit = Column(String, nullable=True)

    start_at = Column(DateTime(timezone=True), nullable=False)
    end_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False)
    received_at = Column(DateTime(timezone=True), nullable=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    source = Column(String, nullable=False, default="healthkit")