"""Offline re-check of the analytic model against the REAL Horizons responses
saved by scripts/horizons_probe.py (backend/tests/fixtures/real/).  Tolerance 0.35 deg."""
import json
from pathlib import Path

import pytest

from app import analytic as A, horizons as H

REAL = Path(__file__).parent / "fixtures" / "real"
POINTS = {"pole_89.5S_0E": (-89.5, 0.0), "85S_120E": (-85.0, 120.0), "equator_0.67N_23.47E": (0.67416, 23.47314)}
FILES = sorted(REAL.glob("sun_*.json")) + sorted(REAL.glob("earth_*.json")) if REAL.exists() else []
TOL = 0.35


@pytest.mark.skipif(not FILES, reason="no real Horizons fixtures yet")
@pytest.mark.parametrize("path", FILES, ids=lambda p: p.stem)
def test_analytic_vs_real_horizons(path):
    body = path.stem.split("_")[0]
    lat, lon = next(v for k, v in POINTS.items() if k in path.stem)
    rows = H.azel_series(H.parse_table(json.loads(path.read_text())["result"]))
    assert rows
    for t, az, el in rows:
        if el is None:
            continue
        a = A.sun_earth_altaz_on_moon(t, lat, lon)[body]
        assert abs(a[1] - el) < TOL
        if el > -5:
            assert abs(((a[0] - az + 180) % 360 - 180) * A._cos(el)) < TOL


SUBS = sorted(REAL.glob("sub_*.json")) if REAL.exists() else []


@pytest.mark.skipif(not SUBS, reason="no real Horizons fixtures yet")
@pytest.mark.parametrize("path", SUBS, ids=lambda p: p.stem)
def test_subpoints_vs_real_horizons(path):
    """Horizons gives Moon longitudes east-positive in 0..360 (probe 2026-11-14)."""
    for r in H.parse_table(json.loads(path.read_text())["result"]):
        st = A.moon_state(r["time"])
        assert abs((st["subearth_lon"] - r["ObsSub-LON"] + 180) % 360 - 180) < TOL
        assert abs(st["subearth_lat"] - r["ObsSub-LAT"]) < TOL
        assert abs((st["subsolar_lon"] - r["SunSub-LON"] + 180) % 360 - 180) < TOL
        assert abs(st["subsolar_lat"] - r["SunSub-LAT"]) < TOL
