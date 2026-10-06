"""Bounded LRU memoization that shares concurrent work for the same key."""
from collections import OrderedDict
from concurrent.futures import Future
from threading import Lock


class MemoCache:
    def __init__(self, max_entries, max_weight=None, weight=lambda value: 0):
        self.max_entries = max_entries
        self.max_weight = max_weight
        self.weight = weight
        self._values = OrderedDict()
        self._pending = {}
        self._weight = 0
        self._lock = Lock()

    def get(self, key, factory):
        with self._lock:
            if key in self._values:
                self._values.move_to_end(key)
                return self._values[key][0]
            pending = self._pending.get(key)
            owner = pending is None
            if owner:
                pending = self._pending[key] = Future()
        if not owner:
            return pending.result()
        try:
            value = factory()
            weight = self.weight(value)
            with self._lock:
                if self.max_weight is None or weight <= self.max_weight:
                    self._values[key] = (value, weight)
                    self._weight += weight
                    while len(self._values) > self.max_entries or (
                        self.max_weight is not None and self._weight > self.max_weight
                    ):
                        _, (_, removed_weight) = self._values.popitem(last=False)
                        self._weight -= removed_weight
                pending.set_result(value)
                del self._pending[key]
            return value
        except BaseException as error:
            with self._lock:
                pending.set_exception(error)
                del self._pending[key]
            raise
