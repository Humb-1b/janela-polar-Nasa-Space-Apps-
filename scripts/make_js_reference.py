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
    return {"generator": "scripts/make_js_reference.py", "cases": cases}


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(build(), indent=0))
    print("wrote", OUT)
