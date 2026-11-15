#!/usr/bin/env python3
"""Validation table: analytic model (backend/app/analytic.py, same maths as engine.js) vs JPL Horizons.

3 sites x 3 dates, 24 hourly samples each, Sun and Earth seen from the site (airless, no terrain on
either side: this checks the ephemerides; terrain is validated separately with synthetic tests).
Prints a Markdown table and writes frontend/data/validation.json.  Needs internet (run in CI).
"""
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app import analytic, horizons  # noqa: E402

SITES = [("a3-malapert-massif", "Malapert Massif (Artemis III region centre)", -85.9872, -0.23676),
         ("im2", "IM-2 Athena, Mons Mouton (NSSDC)", -84.7906, 29.1957),
         ("a11", "Apollo 11 LM (NSSDC)", 0.67416, 23.47314)]
DATES = [datetime(2026, 11, 15), datetime(2027, 2, 10), datetime(2027, 6, 1)]


def adiff(a, b):
    return (a - b + 180.0) % 360.0 - 180.0


def main():
    rows = []
    for sid, name, lat, lon in SITES:
        for d in DATES:
            r = {"site": sid, "name": name, "date": d.strftime("%Y-%m-%d")}
            for body, cmd in (("sun", "10"), ("earth", "399")):
                res = horizons.fetch(horizons.observer_params(cmd, "301", lat, lon, d, d + timedelta(hours=23)), use_cache=False)
                de, da, n = [], [], 0
                for t, az, el in horizons.azel_series(horizons.parse_table(res)):
                    if el is None:
                        continue
                    a = analytic.sun_earth_altaz_on_moon(t, lat, lon)[body]
                    de.append(abs(a[1] - el)); n += 1
                    if el > -5:
                        da.append(abs(adiff(a[0], az)) * abs(analytic._cos(el)))
                r[f"{body}_del_max"] = round(max(de), 4)
                r[f"{body}_daz_max"] = round(max(da), 4) if da else None
                r["n"] = n
            rows.append(r)
    worst = max(max(r["sun_del_max"], r["earth_del_max"], r["sun_daz_max"] or 0, r["earth_daz_max"] or 0) for r in rows)
    out = {"generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "tolerance_deg": 0.35,
           "worst_deg": worst, "rows": rows}
    (ROOT / "frontend" / "data").mkdir(parents=True, exist_ok=True)
    (ROOT / "frontend" / "data" / "validation.json").write_text(json.dumps(out, indent=1))
    f = lambda x: "—" if x is None else f"{x:.3f}"
    print("| Site | Date (UTC, 24 h) | Sun Δel max | Sun Δaz·cos(el) max | Earth Δel max | Earth Δaz·cos(el) max |")
    print("|---|---|---:|---:|---:|---:|")
    for r in rows:
        print(f"| {r['name']} | {r['date']} | {f(r['sun_del_max'])}° | {f(r['sun_daz_max'])}° | {f(r['earth_del_max'])}° | {f(r['earth_daz_max'])}° |")
    print(f"\nWorst difference: {worst:.3f}° (tolerance 0.35°). Generated {out['generated_utc']} from JPL Horizons.")
    return 0 if worst <= 0.35 else 1


if __name__ == "__main__":
    sys.exit(main())
