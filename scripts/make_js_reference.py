#!/usr/bin/env python3
"""Write frontend/tests/fixtures/py_reference.json: analytic.py outputs that the
JS engine must reproduce (frontend/tests/engine.test.mjs).  Offline, deterministic.
backend/tests/test_js_reference.py fails if this file is stale."""
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app import analytic as A  # noqa: E402

OUT = ROOT / "frontend" / "tests" / "fixtures" / "py_reference.json"
POINTS = [(-89.5, 0.0), (-85.0, 120.0), (-84.79, 29.20), (0.67416, 23.47314), (-41.6385, -153.9852)]
DSN = [(35.4267, -116.89), (40.4314, -4.2481), (-35.4014, 148.9817)]


def build():
    t0 = datetime(2026, 11, 15, tzinfo=timezone.utc)
    cases = []
    for k in range(0, 24 * 120, 53):  # ~4 months, irregular step
        t = t0 + timedelta(hours=k, minutes=7 * k % 60)
        ms = int(t.timestamp() * 1000)
        st = A.moon_state(t)
        c = {"t_ms": ms, "state": {k2: st[k2] for k2 in ("subearth_lon", "subearth_lat", "earth_dist_km",
                                                         "subsolar_lon", "subsolar_lat", "sun_dist_km")},
             "moon": [], "dsn": []}
        for lat, lon in POINTS:
            r = A.sun_earth_altaz_on_moon(t, lat, lon, 0.002)
            c["moon"].append({"lat": lat, "lon": lon, "alt_km": 0.002, "sun": list(r["sun"]), "earth": list(r["earth"])})
        for lat, lon in DSN:
            c["dsn"].append({"lat": lat, "lon": lon, "azel": list(A.moon_altaz_from_earth(t, lat, lon))})
        cases.append(c)
    from app import horizons
    hz = horizons.observer_params("10", "301", -85.9872, -0.23676, datetime(2026, 11, 15), datetime(2026, 12, 15), "60 m", fmt="text")
    link = {"lat": -85.9872, "lon": -0.23676, "start_ms": int(datetime(2026, 11, 15, tzinfo=timezone.utc).timestamp() * 1000),
            "stop_ms": int(datetime(2026, 12, 15, tzinfo=timezone.utc).timestamp() * 1000), "url": horizons.text_url(hz)}
    return {"generator": "scripts/make_js_reference.py", "cases": cases, "windows": build_windows(), "horizons_link": link}


def build_windows():
    """Python window rules on Python series; JS must reproduce them exactly."""
    from app import ephemeris, windows as W
    mask = [0.0] * 360
    for a in range(60, 140):
        mask[a] = 1.5          # synthetic ridge to the east
    out = []
    for lat, lon, m, margin, height, dsn_min, rh in ((-84.7906, 29.1957, None, 0.0, 0.0, 10.0, 8),
                                                     (-89.5, 0.0, mask, 0.3, 2.0, 12.0, 12),
                                                     (0.67416, 23.47314, None, 0.0, 10.0, 10.0, 24)):
        ser = ephemeris.site_series(lat, lon, datetime(2026, 11, 15), 20, "analytic")
        ev = W.evaluate(ser, m, margin, height, dsn_min)
        sm = W.summarize(ser, ev, rh)
        ms = lambda t: int(t.replace(tzinfo=timezone.utc).timestamp() * 1000) if t else None
        out.append({
            "params": {"mask": m, "margin": margin, "height": height, "dsn_min": dsn_min, "return_hours": rh},
            "times": [ms(t) for t in ser["times"]], "dsn": ser["dsn"],
            "series": {k: ser[k] for k in ("sun_az", "sun_el", "earth_az", "earth_el")},
            "flags": {k: ev[k] for k in ("sun", "dte", "ideal", "earth_up")},
            "sun_frac": ev["sun_frac"],
            "summary": {k: sm[k] for k in ("sun_hours", "dte_hours", "ideal_hours", "longest_night_hours",
                                           "longest_no_dte_hours", "status")},
            "intervals": {k: [[ms(a), ms(b)] for a, b in v] for k, v in sm["intervals"].items()},
            "return_windows": [[ms(r["start"]), ms(r["latest_start"]), ms(r["sunset"])] for r in sm["return_windows"]],
        })
    return out


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(build(), indent=0))
    print("wrote", OUT)
