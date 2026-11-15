"""JPL Horizons API client (https://ssd.jpl.nasa.gov/api/horizons.api).

* builds OBSERVER-table requests with the parameters validated by the team;
* at most HORIZONS_MAX_CONCURRENT requests in flight (process-wide semaphore);
* retries with back-off on HTTP 5xx / network errors;
* caches raw successful responses on disk (never caches errors);
* parses the CSV block between $$SOE and $$EOE, locating columns by header
  name; "n.a." becomes None.
"""
from __future__ import annotations

import threading
import time
from datetime import datetime

import requests

from . import config
from .cache import DiskCache

_SEM = threading.BoundedSemaphore(config.HORIZONS_MAX_CONCURRENT)
_cache: DiskCache | None = None


class HorizonsError(RuntimeError):
    pass


def get_cache() -> DiskCache:
    global _cache
    if _cache is None:
        _cache = DiskCache(config.CACHE_DIR / "horizons")
    return _cache


def _q(v) -> str:
    return f"'{v}'"


def _fmt_time(t) -> str:
    if isinstance(t, datetime):
        return t.strftime("%Y-%m-%d %H:%M")
    return str(t)


def site_coord(lat: float, lon_east: float, alt_km: float = 0.0) -> str:
    """SITE_COORD string: east longitude 0..360, latitude, altitude km."""
    return f"{lon_east % 360.0:.6f},{lat:.6f},{alt_km:.4f}"


def observer_params(command: str, center_body: str, lat: float, lon_east: float,
                    start, stop, step: str = "60 m", alt_km: float = 0.0,
                    quantities: str = "4", fmt: str = "json") -> dict:
    """Parameters for an OBSERVER table from a geodetic site on ``center_body``.

    center_body: '301' (Moon) or '399' (Earth).
    """
    return {
        "format": fmt,
        "COMMAND": _q(command),
        "OBJ_DATA": _q("NO"),
        "MAKE_EPHEM": _q("YES"),
        "EPHEM_TYPE": _q("OBSERVER"),
        "CENTER": _q(f"coord@{center_body}"),
        "COORD_TYPE": _q("GEODETIC"),
        "SITE_COORD": _q(site_coord(lat, lon_east, alt_km)),
        "START_TIME": _q(_fmt_time(start)),
        "STOP_TIME": _q(_fmt_time(stop)),
        "STEP_SIZE": _q(step),
        "QUANTITIES": _q(quantities),
        "ANG_FORMAT": _q("DEG"),
        "APPARENT": _q("AIRLESS"),
        "CSV_FORMAT": _q("YES"),
        "TIME_DIGITS": _q("MINUTES"),
        "EXTRA_PREC": _q("YES"),
    }


def geocentric_params(command: str, start, stop, step: str, quantities: str, fmt: str = "json") -> dict:
    """OBSERVER table from Earth's centre (500@399), e.g. sub-points of the Moon."""
    return {
        "format": fmt, "COMMAND": _q(command), "OBJ_DATA": _q("NO"), "MAKE_EPHEM": _q("YES"),
        "EPHEM_TYPE": _q("OBSERVER"), "CENTER": _q("500@399"),
        "START_TIME": _q(_fmt_time(start)), "STOP_TIME": _q(_fmt_time(stop)),
        "STEP_SIZE": _q(step), "QUANTITIES": _q(quantities), "ANG_FORMAT": _q("DEG"),
        "CSV_FORMAT": _q("YES"), "TIME_DIGITS": _q("MINUTES"), "EXTRA_PREC": _q("YES"),
    }


def text_url(params: dict) -> str:
    """Human-readable official table URL (format=text) for the same request."""
    p = dict(params, format="text")
    return requests.Request("GET", config.HORIZONS_URL, params=p).prepare().url


def fetch(params: dict, session=None, use_cache: bool = True) -> str:
    """Return the Horizons ``result`` text.  Raises HorizonsError."""
    cache = get_cache()
    key = cache.key(params)
    if use_cache:
        hit = cache.get(key)
        if hit is not None:
            return hit["result"]
    http = session or requests
    last = None
    for attempt in range(config.HORIZONS_RETRIES):
        try:
            with _SEM:
                r = http.get(config.HORIZONS_URL, params=params, timeout=config.HORIZONS_TIMEOUT_S)
        except requests.RequestException as exc:
            last = exc
        else:
            if r.status_code >= 500:
                last = HorizonsError(f"HTTP {r.status_code}")
            elif r.status_code != 200:
                raise HorizonsError(f"HTTP {r.status_code}: {r.text[:200]}")
            else:
                data = r.json()
                if "error" in data:
                    raise HorizonsError(data["error"])
                result = data.get("result", "")
                if "$$SOE" not in result:
                    raise HorizonsError("no $$SOE in response: " + result[-400:])
                if use_cache:
                    cache.set(key, {"result": result, "signature": data.get("signature")})
                return result
        time.sleep(min(8.0, 1.5 * 2 ** attempt))
    raise HorizonsError(f"Horizons unavailable after {config.HORIZONS_RETRIES} tries: {last}")


def _num(s: str):
    s = s.strip()
    if not s or s.lower().startswith("n.a"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_table(result: str) -> list[dict]:
    """Parse the CSV ephemeris block.

    Returns a list of dicts: {'time': datetime, '<Header>': float|None, ...}.
    Headers are kept as Horizons prints them (stripped), e.g. 'Azi_(a-app)'.
    """
    lines = result.splitlines()
    try:
        i0 = next(i for i, l in enumerate(lines) if l.strip() == "$$SOE")
        i1 = next(i for i, l in enumerate(lines) if l.strip() == "$$EOE")
    except StopIteration:
        raise HorizonsError("missing $$SOE/$$EOE markers")
    header = None
    for l in reversed(lines[:i0]):
        if "Date" in l and "," in l:
            header = [h.strip() for h in l.split(",")]
            break
    if header is None:
        raise HorizonsError("CSV header not found")
    rows = []
    for l in lines[i0 + 1:i1]:
        if not l.strip():
            continue
        cells = [c.strip() for c in l.split(",")]
        row = {"time": parse_time(cells[0])}
        for h, c in zip(header[1:], cells[1:]):
            if h:
                row[h] = _num(c)
        rows.append(row)
    return rows


def parse_time(s: str) -> datetime:
    s = s.strip()
    for fmt in ("%Y-%b-%d %H:%M:%S.%f", "%Y-%b-%d %H:%M:%S", "%Y-%b-%d %H:%M", "%Y-%b-%d"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            pass
    raise HorizonsError(f"bad time {s!r}")


def column(rows: list[dict], prefix: str) -> str:
    """Name of the first column whose header starts with ``prefix`` (e.g. 'Azi', 'Elev')."""
    if not rows:
        raise HorizonsError("empty table")
    for k in rows[0]:
        if k != "time" and k.startswith(prefix):
            return k
    raise HorizonsError(f"no column starting with {prefix!r}: {list(rows[0])}")


def azel_series(rows: list[dict]):
    """[(time, az, el)] using the 'Azi*' / 'Elev*' columns."""
    a, e = column(rows, "Azi"), column(rows, "Elev")
    return [(r["time"], r[a], r[e]) for r in rows]
