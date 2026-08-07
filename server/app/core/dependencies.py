from fastapi import Depends
from sqlalchemy.orm import Session

from app.db.sync_session import get_sync_db
from app.repository.biometrics_repository import BiometricsRepository
from app.repository.lifestyle_repository import LifestyleRepository
from app.repository.user_repository import UserRepository

# Mock*Repository imports removed — these are the real DB-backed
# implementations now. If you need to fall back to mocks temporarily (e.g.
# no DB connection handy), swap the return type + body back to
# Mock*Repository() as before; the service layer doesn't care either way,
# since both implementations return identically-shaped dicts.


def get_user_repo(db: Session = Depends(get_sync_db)) -> UserRepository:
    return UserRepository(db)


def get_biometrics_repo(db: Session = Depends(get_sync_db)) -> BiometricsRepository:
    return BiometricsRepository(db)


def get_lifestyle_repo(db: Session = Depends(get_sync_db)) -> LifestyleRepository:
    return LifestyleRepository(db)