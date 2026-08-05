# Shared declarative base class all ORM models inherit from
"""
Declarative Base. Deliberately does NOT import any model here — that was
the earlier version, and it's what caused a circular import
(app/db/base.py -> app/models/biometrics.py -> app/db/base.py) the moment
something imported a model directly before importing this module first.

Whatever needs Base.metadata to be COMPLETE (create_tables.py, a future
Alembic env.py) is responsible for importing every model itself before
touching metadata — see create_tables.py for exactly that pattern. This
file only defines Base; it has zero opinions about which models exist.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass