#!/usr/bin/env python3
"""Terrain horizon masks from LOLA DEMs (NASA PGDA product 90, Barker et al. 2023).

    python scripts/horizon_mask_from_dem.py --dem LDEM_80S_80MPP_ADJ.TIF --dem LDEM_60S_240MPP_ADJ.TIF
    python scripts/horizon_mask_from_dem.py --dem ... --point -85.98 -0.24      # print one mask

For each polar site (lat <= -60) in backend/data/sites.json, casts a ray every
1 deg of azimuth (clockwise from north) out to 150 km, sampling the first DEM
that covers each point (list the finest first).  Horizon angle along the ray:
    atan((z - z0 - d^2 / 2R) / d)          (d = ground distance, R = 1737.4 km)
and the mask is the maximum over the ray.  Local north and east directions come
from finite differences of the projection.  The observer is OBSERVER_M above the
DEM surface (avoids single-pixel noise right under the feet); the app adds any
extra point height through the horizon depression.

Writes backend/data/horizon_masks/<id>.csv (azimuth_deg,horizon_deg).
Reads GeoTIFFs with rasterio if installed, else with tifffile (see dem_io.py).
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dem_io import DEM, read_dem  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
R_MOON = 1737400.0
MAX_KM = 150.0
OBSERVER_M = 2.0


def local_axes(dem: DEM, lat: float, lon: float, eps_deg: float = 1e-4):
    """Projected displacement per true metre toward local north and east (finite differences)."""
    x0, y0 = dem.forward(lat, lon)
    xn, yn = dem.forward(lat + eps_deg, lon)
    xe, ye = dem.forward(lat, lon + eps_deg)
    dn = R_MOON * np.radians(eps_deg)
    de = R_MOON * np.cos(np.radians(lat)) * np.radians(eps_deg)
    north = np.array([(xn - x0) / dn, (yn - y0) / dn])
    east = np.array([(xe - x0) / de, (ye - y0) / de])
    return (float(x0), float(y0)), north, east


def horizon_mask(dems: list[DEM], lat: float, lon: float, max_km: float = MAX_KM,
                 observer_m: float = OBSERVER_M, n_az: int = 360):
    """Returns (mask[n_az] in degrees, info dict)."""
    base = dems[0]
    (x0, y0), north, east = local_axes(base, lat, lon)
    z0 = float(_sample(dems, np.array([x0]), np.array([y0]))[0])
    if np.isnan(z0):
        raise ValueError(f"site {lat},{lon} outside the DEMs")
    z0 += observer_m
    step = base.px
    d = np.arange(step, max_km * 1000 + step / 2, step)          # true ground distance (m)
    az = np.radians(np.arange(n_az) * 360.0 / n_az)
    dirs = np.cos(az)[:, None, None] * north + np.sin(az)[:, None, None] * east   # (n_az, 1, 2)
    xs = x0 + dirs[..., 0] * d[None, :]
    ys = y0 + dirs[..., 1] * d[None, :]
    z = _sample(dems, xs.ravel(), ys.ravel()).reshape(xs.shape)
    ang = np.degrees(np.arctan((z - z0 - d[None, :] ** 2 / (2 * R_MOON)) / d[None, :]))
    covered = np.isfinite(ang)
    mask = np.nanmax(np.where(covered, ang, -90.0), axis=1)
    reach = np.where(covered.any(axis=1), d[np.maximum(0, covered.shape[1] - 1 - np.argmax(covered[:, ::-1], axis=1))], 0)
    imax = np.nanargmax(np.where(covered, ang, -90.0), axis=1)
    info = {"z0_m": z0 - observer_m, "min_reach_km": float(reach.min() / 1000),
            "blocking_dist_km_median": float(np.median(d[imax]) / 1000)}
    return mask, info


def _sample(dems, x, y):
    out = np.full(np.shape(x), np.nan)
    for dem in dems:
        need = np.isnan(out)
        if not need.any():
            break
        out[need] = dem.sample(x[need], y[need])
    return out


def write_csv(path: Path, mask, meta: dict):
    lines = [f"# {k}: {v}" for k, v in meta.items()] + ["azimuth_deg,horizon_deg"]
    lines += [f"{i},{m:.3f}" for i, m in enumerate(mask)]
    path.write_text("\n".join(lines) + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dem", action="append", required=True, help="GeoTIFF; finest first")
    ap.add_argument("--point", nargs=2, type=float, metavar=("LAT", "LON"))
    ap.add_argument("--max-lat", type=float, default=-60.0, help="only sites south of this latitude")
    a = ap.parse_args()
    dems = [read_dem(p, Path(p).name) for p in a.dem]
    if a.point:
        m, info = horizon_mask(dems, *a.point)
        print(json.dumps(info), "\n", " ".join(f"{v:.2f}" for v in m))
        return 0
    sites = json.loads((ROOT / "backend" / "data" / "sites.json").read_text(encoding="utf-8"))["sites"]
    out = ROOT / "backend" / "data" / "horizon_masks"
    out.mkdir(parents=True, exist_ok=True)
    for s in sites:
        if s.get("lat") is None or s["lat"] > a.max_lat:
            continue
        m, info = horizon_mask(dems, s["lat"], s["lon"])
        meta = {"site": s["id"], "lat": s["lat"], "lon": s["lon"], "dems": ", ".join(d.name for d in dems),
                "source": "LOLA DEMs, NASA PGDA product 90 (Barker et al. 2023, doi:10.3847/PSJ/acf3e1)",
                "observer_height_m": OBSERVER_M, "max_distance_km": MAX_KM,
                "surface_height_m": round(info["z0_m"], 1), "min_ray_coverage_km": round(info["min_reach_km"], 1),
                "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")}
        write_csv(out / f"{s['id']}.csv", m, meta)
        print(f"{s['id']:24s} z={info['z0_m']:7.0f} m  horizon min/mean/max {m.min():6.2f} {m.mean():6.2f} {m.max():6.2f} deg"
              f"  rays reach >= {info['min_reach_km']:.0f} km")
    return 0


if __name__ == "__main__":
    sys.exit(main())
