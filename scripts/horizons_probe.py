#!/usr/bin/env python3
"""Real JPL Horizons query vs. the analytic model (needs internet).

Usage (from the repository root):
    python scripts/horizons_probe.py            # full probe, ~25 queries
    python scripts/horizons_probe.py --quick    # 1 date, ~8 queries

What it checks, in this order (each layer feeds the next):
  1. sub-Earth point of the Moon  (Horizons QUANTITIES 14, geocentric)  vs analytic.moon_state
  2. sub-solar point of the Moon  (Horizons QUANTITIES 15, geocentric)  vs analytic.moon_state
  3. Sun and Earth az/el from 3 lunar test points (QUANTITIES 4, AIRLESS)
  4. Moon az/el from Goldstone (DSN), QUANTITIES 4
It saves every raw response under backend/tests/fixtures/real/ (used by the
offline tests) and prints max/mean differences in degrees.  Tolerance: 0.35 deg.

The three lunar test points are generic validation points, not landing sites.
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app import analytic, horizons  # noqa: E402
from app.config import DSN_SITES  # noqa: E402

FIX = ROOT / "backend" / "tests" / "fixtures" / "real"
TOL = 0.35
POINTS = {
    "pole_89.5S_0E": (-89.5, 0.0),
    "85S_120E": (-85.0, 120.0),
    "equator_0.67N_23.47E": (0.67416, 23.47314),
}
DATES = [datetime(2026, 11, 15), datetime(2027, 2, 10), datetime(2027, 6, 1)]


def adiff(a, b):
    return (a - b + 180.0) % 360.0 - 180.0


def query(name, params):
    res = horizons.fetch(params, use_cache=False)
    FIX.mkdir(parents=True, exist_ok=True)
    (FIX / f"{name}.json").write_text(json.dumps({"params": params, "result": res}, indent=1))
    return res


def stats(xs):
    """(max |x|, mean |x|); (0, 0) when there are no samples (e.g. body below
    the horizon all day), so an empty set never counts as a failure."""
    xs = [abs(x) for x in xs if x is not None]
    return (max(xs), statistics.mean(xs)) if xs else (0.0, 0.0)


def find(row, *prefixes):
    for k in row:
        if k != "time" and any(k.startswith(p) for p in prefixes):
            return k
    raise KeyError(f"{prefixes} not in {list(row)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    args = ap.parse_args()
    dates = DATES[:1] if args.quick else DATES
    jobs = {}
    for d in dates:
        tag = d.strftime("%Y%m%d")
        s, e = d, d + timedelta(hours=23)
        jobs[f"sub_{tag}"] = horizons.geocentric_params("301", s, e, "60 m", "14,15")
        for pname, (lat, lon) in POINTS.items():
            for body, cmd in (("sun", "10"), ("earth", "399")):
                jobs[f"{body}_{pname}_{tag}"] = horizons.observer_params(cmd, "301", lat, lon, s, e)
        glat, glon = DSN_SITES["goldstone"]
        jobs[f"moon_goldstone_{tag}"] = horizons.observer_params("301", "399", glat, glon, s, e)

    print(f"Querying Horizons: {len(jobs)} requests (max 2 in parallel)...")
    try:
        with ThreadPoolExecutor(max_workers=2) as ex:
            results = dict(zip(jobs, ex.map(lambda kv: query(*kv), jobs.items())))
    except horizons.HorizonsError as exc:
        print("Could not reach Horizons (no internet / proxy / JPL down):\n ", exc)
        return 2

    report = []
    ok = True
    print("\n== 1-2. Selenographic sub-points (analytic - Horizons), deg ==")
    for name, res in results.items():
        if not name.startswith("sub_"):
            continue
        rows = horizons.parse_table(res)
        r0 = rows[0]
        print("  Horizons columns:", [k for k in r0 if k != "time"])
        print("  first row raw   :", {k: v for k, v in r0.items() if k != "time"})
        ko_lon, ko_lat = find(r0, "ObsSub-LON"), find(r0, "ObsSub-LAT")
        ks_lon, ks_lat = find(r0, "SunSub-LON"), find(r0, "SunSub-LAT")
        de_lon, de_lat, ds_lon, ds_lat = [], [], [], []
        for r in rows:
            st = analytic.moon_state(r["time"])
            de_lon.append(adiff(st["subearth_lon"], r[ko_lon])); de_lat.append(st["subearth_lat"] - r[ko_lat])
            ds_lon.append(adiff(st["subsolar_lon"], r[ks_lon])); ds_lat.append(st["subsolar_lat"] - r[ks_lat])
        a0 = analytic.moon_state(r0["time"])
        print(f"  {name}: analytic first row sub-Earth ({a0['subearth_lon']:.4f}, {a0['subearth_lat']:.4f})"
              f" sub-Sun ({a0['subsolar_lon']:.4f}, {a0['subsolar_lat']:.4f})")
        for label, xs in (("subEarth lon", de_lon), ("subEarth lat", de_lat),
                          ("subSun lon", ds_lon), ("subSun lat", ds_lat)):
            mx, mn = stats(xs)
            ok &= mx <= TOL
            print(f"    {label:13s} max {mx:.4f}  mean {mn:.4f}  {'OK' if mx <= TOL else 'FAIL'}")
            report.append((name, label, mx, mn))

    print("\n== 3. Az/El on the Moon (analytic - Horizons), deg; only rows with el > -5 ==")
    for name, res in results.items():
        if not (name.startswith("sun_") or name.startswith("earth_")):
            continue
        body = name.split("_")[0]
        pname = next(p for p in POINTS if p in name)
        lat, lon = POINTS[pname]
        daz, delv = [], []
        for t, az, el in horizons.azel_series(horizons.parse_table(res)):
            if az is None or el is None:
                continue
            a = analytic.sun_earth_altaz_on_moon(t, lat, lon)[body]
            delv.append(a[1] - el)
            if el > -5:
                daz.append(adiff(a[0], az) * analytic._cos(el))  # on-sky azimuth error
        (mx_e, mn_e), (mx_a, mn_a) = stats(delv), stats(daz)
        note = "" if daz else " (never above -5 deg: az not compared)"
        ok &= mx_e <= TOL and mx_a <= TOL
        print(f"  {name:38s} el max {mx_e:.4f} mean {mn_e:.4f} | az*cos(el) max {mx_a:.4f}"
              f"  {'OK' if max(mx_e, mx_a) <= TOL else 'FAIL'}{note}")
        report.append((name, "el", mx_e, mn_e)); report.append((name, "az", mx_a, mn_a))

    print("\n== 4. Moon from Goldstone (analytic - Horizons), deg ==")
    glat, glon = DSN_SITES["goldstone"]
    for name, res in results.items():
        if not name.startswith("moon_goldstone"):
            continue
        de = []
        for t, az, el in horizons.azel_series(horizons.parse_table(res)):
            if el is not None:
                de.append(analytic.moon_altaz_from_earth(t, glat, glon)[1] - el)
        mx, mn = stats(de)
        ok &= mx <= TOL
        print(f"  {name:38s} el max {mx:.4f} mean {mn:.4f}  {'OK' if mx <= TOL else 'FAIL'}")
        report.append((name, "el", mx, mn))

    out = FIX / "probe_report.json"
    out.write_text(json.dumps([dict(zip(("query", "quantity", "max_deg", "mean_deg"), r)) for r in report], indent=1))
    print(f"\nRaw responses + report saved in {FIX}")
    print("RESULT:", "ALL WITHIN 0.35 deg" if ok else "SOME CHECKS ABOVE 0.35 deg")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
