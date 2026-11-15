"""Site catalogue: backend/data/sites.json is the single source of truth.
Terrain horizon masks live in backend/data/horizon_masks/<id>.csv
(two columns: azimuth_deg, horizon_deg; 360 rows, az 0..359, clockwise from north)."""
from __future__ import annotations

import csv
import json
from functools import lru_cache

from . import config

SETS = ("artemis3", "landers", "apollo", "contrast")


class UnknownSite(KeyError):
    pass


@lru_cache(maxsize=1)
def _load():
    data = json.loads((config.DATA_DIR / "sites.json").read_text(encoding="utf-8"))
    return {s["id"]: s for s in data["sites"]}


def reload():
    _load.cache_clear()
    load_mask.cache_clear()


@lru_cache(maxsize=None)
def load_mask(site_id: str):
    p = config.DATA_DIR / "horizon_masks" / f"{site_id}.csv"
    if not p.exists():
        return None
    vals = {}
    with p.open() as fh:
        for row in csv.reader(fh):
            if not row or row[0].startswith("#") or not row[0].strip().lstrip("-").replace(".", "").isdigit():
                continue
            vals[int(round(float(row[0]))) % 360] = float(row[1])
    if len(vals) != 360:
        raise ValueError(f"horizon mask {p.name} must have 360 azimuths, has {len(vals)}")
    return tuple(vals[i] for i in range(360))


def has_coords(s: dict) -> bool:
    return s.get("lat") is not None and s.get("lon") is not None


def all_sites():
    return list(_load().values())


def get(site_id: str) -> dict:
    try:
        return _load()[site_id]
    except KeyError:
        raise UnknownSite(f"unknown site '{site_id}'")


def select(set_name: str | None = None, ids: list[str] | None = None, computable_only=True):
    out = [get(i) for i in ids] if ids else all_sites()
    if set_name and set_name != "all":
        if set_name not in SETS:
            raise ValueError(f"set must be one of {SETS + ('all',)}")
        out = [s for s in out if s["set"] == set_name]
    return [s for s in out if has_coords(s)] if computable_only else out


def public(s: dict) -> dict:
    d = dict(s)
    d["has_coords"] = has_coords(s)
    d["has_horizon_mask"] = load_mask(s["id"]) is not None
    return d


def validate_point(lat: float, lon: float):
    if not -90 <= lat <= 90:
        raise ValueError("lat must be in [-90, 90]")
    if not -180 <= lon <= 360:
        raise ValueError("lon must be in [-180, 360] (east-positive)")
    return lat, ((lon + 180) % 360) - 180
