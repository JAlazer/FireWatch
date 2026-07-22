from abc import ABC, abstractmethod
from typing import Generic, TypeVar

T = TypeVar("T")


class BaseRepository(ABC, Generic[T]):
    @abstractmethod
    def get(self, id: str) -> T | None:
        ...

    @abstractmethod
    def get_all(self) -> list[T]:
        ...

    @abstractmethod
    def create(self, data: dict) -> T:
        ...

    @abstractmethod
    def update(self, id: str, data: dict) -> T | None:
        ...
