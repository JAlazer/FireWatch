from app.repository.mock_biometrics_repository import MockBiometricsRepository
from app.repository.mock_lifestyle_repository import MockLifestyleRepository
from app.repository.mock_user_repository import MockUserRepository

_user_repo = MockUserRepository()
_biometrics_repo = MockBiometricsRepository()
_lifestyle_repo = MockLifestyleRepository()


def get_user_repo() -> MockUserRepository:
    return _user_repo


def get_biometrics_repo() -> MockBiometricsRepository:
    return _biometrics_repo


def get_lifestyle_repo() -> MockLifestyleRepository:
    return _lifestyle_repo
