from abc import ABC, abstractmethod


class Store(ABC):
    @abstractmethod
    def load(self, key: str) -> bytes:
        raise NotImplementedError
