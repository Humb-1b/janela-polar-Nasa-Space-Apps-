"""Tiny disk + memory cache keyed by a hash of the request parameters."""
from __future__ import annotations

import hashlib
import json
import threading
from pathlib import Path


class DiskCache:
    def __init__(self, directory: Path):
        self.dir = Path(directory)
        self.dir.mkdir(parents=True, exist_ok=True)
        self._mem: dict[str, object] = {}
        self._lock = threading.Lock()

    @staticmethod
    def key(params: dict) -> str:
        blob = json.dumps(params, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(blob.encode()).hexdigest()[:32]

    def _path(self, key: str) -> Path:
        return self.dir / f"{key}.json"

    def get(self, key: str):
        with self._lock:
            if key in self._mem:
                return self._mem[key]
        p = self._path(key)
        if p.exists():
            try:
                val = json.loads(p.read_text())
            except (OSError, ValueError):
                return None
            with self._lock:
                self._mem[key] = val
            return val
        return None

    def set(self, key: str, value) -> None:
        tmp = self._path(key).with_suffix(".tmp")
        tmp.write_text(json.dumps(value))
        tmp.replace(self._path(key))
        with self._lock:
            self._mem[key] = value
