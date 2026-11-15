"""Ephemeris series for a lunar site: JPL Horizons or the analytic model.

mode = 'horizons' | 'analytic' | 'auto'
'auto' tries Horizons and falls back to the analytic model on any Horizons
error; the result then carries source='analytic-fallback' and is NOT stored in
the in-memory cache (so the next request tries Horizons again).
"""
from __future__ import annotations

import threading
from datetime import datetime, timedelta

from . import analytic, horizons
from .config import DSN_SITES

_mem: dict = {}
_mem_lock = threading.Lock()


def time_grid(start: datetime, days: int, step_min: int = 60) -> list[datetime]:
    n = int(days * 24 * 60 / step_min)
    return [start + timedelta(minutes=step_min * i) for i in range(n)]


def _analytic_site(lat, lon, times, alt_km):
    s = {"sun_az": [], "sun_el": [], "earth_az": [], "earth_el": []}
    for t in times:
        r = analytic.sun_earth_altaz_on_moon(t, lat, lon, alt_km)
        s["sun_az"].append(r["sun"][0]); s["sun_el"].append(r["sun"][1])
        s["earth_az"].append(r["earth"][0]); s["earth_el"].append(r["earth"][1])
    return s


_dsn_memo: dict = {}


def _analytic_dsn(times):
    """DSN series do not depend on the lunar site: memoised per time grid."""
    key = (times[0], times[-1], len(times))
    if key not in _dsn_memo:
        _dsn_memo[key] = _compute_dsn(times)
    return _dsn_memo[key]


def _compute_dsn(times):
    return {k: [analytic.moon_altaz_from_earth(t, la, lo)[1] for t in times] for k, (la, lo) in DSN_SITES.items()}


def _horizons_align(rows, times, key):
    by_t = {r[0]: r for r in rows}
    out = []
    for t in times:
        r = by_t.get(t.replace(second=0, microsecond=0))
        if r is None:
            raise horizons.HorizonsError(f"Horizons row missing for {t}")
        out.append(r[1] if key == "az" else r[2])
    return out


def _span(times, step_min):
    return times[0], times[-1], f"{step_min} m"


def _horizons_site(lat, lon, times, step_min):
    a, b, step = _span(times, step_min)
    s = {}
    for body, cmd in (("sun", "10"), ("earth", "399")):
        rows = horizons.azel_series(horizons.parse_table(horizons.fetch(
            horizons.observer_params(cmd, "301", lat, lon, a, b, step))))
        s[f"{body}_az"] = _horizons_align(rows, times, "az")
        s[f"{body}_el"] = _horizons_align(rows, times, "el")
    return s


def _horizons_dsn(times, step_min):
    a, b, step = _span(times, step_min)
    out = {}
    for k, (la, lo) in DSN_SITES.items():
        rows = horizons.azel_series(horizons.parse_table(horizons.fetch(
            horizons.observer_params("301", "399", la, lo, a, b, step))))
        out[k] = _horizons_align(rows, times, "el")
    return out


def site_series(lat: float, lon: float, start: datetime, days: int, mode: str = "auto",
                step_min: int = 60, alt_km: float = 0.0) -> dict:
    """Return {'times', 'sun_az', 'sun_el', 'earth_az', 'earth_el', 'dsn', 'source', 'error'}."""
    if mode not in ("auto", "horizons", "analytic"):
        raise ValueError("mode must be auto, horizons or analytic")
    key = (round(lat, 6), round(lon, 6), start.isoformat(), days, mode, step_min, alt_km)
    with _mem_lock:
        if key in _mem:
            return _mem[key]
    times = time_grid(start, days, step_min)
    err = None
    if mode in ("auto", "horizons"):
        try:
            s = _horizons_site(lat, lon, times, step_min)
            s["dsn"] = _horizons_dsn(times, step_min)
            s["source"] = "horizons"
        except horizons.HorizonsError as exc:
            if mode == "horizons":
                raise
            err = str(exc)
            s = None
    if mode == "analytic" or s is None:
        s = _analytic_site(lat, lon, times, alt_km)
        s["dsn"] = _analytic_dsn(times)
        s["source"] = "analytic" if mode == "analytic" else "analytic-fallback"
    s["times"] = times
    s["error"] = err
    if s["source"] != "analytic-fallback":
        with _mem_lock:
            _mem[key] = s
    return s


def clear_memory_cache():
    with _mem_lock:
        _mem.clear()
