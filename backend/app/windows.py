"""Illumination / communication window rules.

Inputs are time series sampled on a regular grid (default 60 min):
sun (az, el), earth (az, el) as seen from the lunar site and, per DSN complex,
the Moon's elevation.  Rules (team brief, section 3):

* effective horizon(az) = terrain mask(az) + margin - depression(h),
  depression = acos(R / (R + h))      [no atmosphere -> no refraction]
* sun fraction = share of the solar disc (radius 0.2666 deg) above it;
  "sun" means fraction >= 0.5
* DTE = Earth's centre above the effective horizon AND the Moon at least
  `dsn_min_el` above the horizon at >= 1 DSN complex
* ideal = sun AND DTE
* return window = an ideal interval lasting >= `return_hours`; it must start
  no later than `latest_start` = interval end - return_hours, and the deadline
  shown is the following sunset.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta

from .config import MOON_RADIUS_KM, SUN_RADIUS_DEG, DSN_MIN_ELEV_DEG

EDGE_TOL = timedelta(seconds=1)


def depression_deg(height_m: float, radius_km: float = MOON_RADIUS_KM) -> float:
    """Dip of the geometric horizon for an eye ``height_m`` above a sphere."""
    if height_m <= 0:
        return 0.0
    R = radius_km * 1000.0
    return math.degrees(math.acos(R / (R + height_m)))


def mask_at(mask, az: float) -> float:
    """Terrain horizon elevation at azimuth ``az`` from a 360-value mask (1 deg
    steps, index 0 = north, clockwise), linearly interpolated, wrap-around."""
    if mask is None or len(mask) == 0:
        return 0.0
    n = len(mask)
    x = (az % 360.0) * n / 360.0
    i = int(math.floor(x)) % n
    f = x - math.floor(x)
    return mask[i] * (1 - f) + mask[(i + 1) % n] * f


def effective_horizon(az: float, mask=None, margin_deg: float = 0.0, height_m: float = 0.0) -> float:
    return mask_at(mask, az) + margin_deg - depression_deg(height_m)


def disc_fraction(el: float, horizon: float, radius: float = SUN_RADIUS_DEG) -> float:
    """Fraction of a uniform disc of angular ``radius`` above a straight horizon."""
    d = el - horizon
    if d >= radius:
        return 1.0
    if d <= -radius:
        return 0.0
    r = radius
    below = r * r * math.acos(d / r) - d * math.sqrt(r * r - d * d)
    return 1.0 - below / (math.pi * r * r)


def evaluate(series: dict, mask=None, margin_deg=0.0, height_m=0.0, dsn_min_el=DSN_MIN_ELEV_DEG) -> dict:
    """Per-sample flags.  ``series`` keys: times, sun_az, sun_el, earth_az,
    earth_el, dsn {name: [moon el]}.  Returns dict of lists."""
    n = len(series["times"])
    out = {k: [] for k in ("sun_frac", "sun", "earth_up", "dsn_any", "dte", "ideal",
                           "hz_sun", "hz_earth", "dsn_active")}
    for i in range(n):
        hs = effective_horizon(series["sun_az"][i], mask, margin_deg, height_m)
        he = effective_horizon(series["earth_az"][i], mask, margin_deg, height_m)
        frac = disc_fraction(series["sun_el"][i], hs)
        active = [k for k, els in series["dsn"].items() if els[i] is not None and els[i] >= dsn_min_el]
        earth_up = series["earth_el"][i] > he
        dte = earth_up and bool(active)
        sun = frac >= 0.5
        for k, v in (("sun_frac", frac), ("sun", sun), ("earth_up", earth_up), ("dsn_any", bool(active)),
                     ("dte", dte), ("ideal", sun and dte), ("hz_sun", hs), ("hz_earth", he),
                     ("dsn_active", active)):
            out[k].append(v)
    return out


def intervals(times: list[datetime], flags: list[bool], step: timedelta) -> list[tuple[datetime, datetime]]:
    """Contiguous True runs as [start, end) with end = last true sample + step,
    clipped to the end of the series (± 1 s tolerance at the edges)."""
    out, start = [], None
    if not times:
        return out
    t_end = times[-1] + step
    for t, f in zip(times, flags):
        if f and start is None:
            start = t
        elif not f and start is not None:
            out.append((start, t))
            start = None
    if start is not None:
        out.append((start, t_end))
    return [(a, min(b, t_end + EDGE_TOL)) for a, b in out]


def _hours(iv):
    return sum((b - a).total_seconds() for a, b in iv) / 3600.0


def _longest_gap(times, flags, step):
    """Longest run of False, in hours (e.g. the longest night)."""
    return max((_hours([iv]) for iv in intervals(times, [not f for f in flags], step)), default=0.0)


def _next_change(times, flags, i0, to_value):
    for t, f in zip(times[i0:], flags[i0:]):
        if f == to_value:
            return t
    return None


def summarize(series: dict, ev: dict, return_hours: float = 8.0, now: datetime | None = None) -> dict:
    times = series["times"]
    if not times:
        return {}
    step = times[1] - times[0] if len(times) > 1 else timedelta(hours=1)
    now = now or times[0]
    i0 = next((i for i, t in enumerate(times) if t >= now), len(times) - 1)
    sun_iv = intervals(times, ev["sun"], step)
    dte_iv = intervals(times, ev["dte"], step)
    ideal_iv = intervals(times, ev["ideal"], step)
    need = timedelta(hours=return_hours)
    ret = []
    for a, b in ideal_iv:
        if b - a + EDGE_TOL >= need:
            sunset = next((sb for sa, sb in sun_iv if sa <= a < sb + EDGE_TOL), None)
            ret.append({"start": a, "end": b, "latest_start": b - need, "sunset": sunset,
                        "hours": (b - a).total_seconds() / 3600})
    span_h = (times[-1] + step - times[0]).total_seconds() / 3600
    sun_now, dte_now = ev["sun"][i0], ev["dte"][i0]
    return {
        "span_hours": span_h,
        "sun_hours": _hours(sun_iv), "dte_hours": _hours(dte_iv), "ideal_hours": _hours(ideal_iv),
        "sun_pct": 100 * _hours(sun_iv) / span_h, "dte_pct": 100 * _hours(dte_iv) / span_h,
        "ideal_pct": 100 * _hours(ideal_iv) / span_h,
        "longest_night_hours": _longest_gap(times, ev["sun"], step),
        "longest_no_dte_hours": _longest_gap(times, ev["dte"], step),
        "status": ("ideal" if sun_now and dte_now else "sun_only" if sun_now else "dte_only" if dte_now else "dark"),
        "next_sunset": _next_change(times, ev["sun"], i0, False) if sun_now else None,
        "next_sunrise": _next_change(times, ev["sun"], i0, True) if not sun_now else None,
        "next_earthset": _next_change(times, ev["earth_up"], i0, False) if ev["earth_up"][i0] else None,
        "next_earthrise": _next_change(times, ev["earth_up"], i0, True) if not ev["earth_up"][i0] else None,
        "next_ideal": next(({"start": a, "end": b} for a, b in ideal_iv if b > now), None),
        "intervals": {"sun": sun_iv, "dte": dte_iv, "ideal": ideal_iv},
        "return_windows": ret, "return_hours": return_hours,
    }
