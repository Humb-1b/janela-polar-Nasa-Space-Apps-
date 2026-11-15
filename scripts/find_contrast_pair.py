#!/usr/bin/env python3
"""Pick a 'few km' contrast pair inside an Artemis III region from the LOLA DEM.

    python scripts/find_contrast_pair.py --dem LDEM_80S_80MPP_ADJ.TIF --region a3-de-gerlache-rim-2 --tag dg2 [--write]

crest  = highest DEM point within +-10 km of the region centre (USGS grid centre)
hollow = lowest DEM point 2.5-3.5 km from the crest
--write adds both points to backend/data/sites.json (set 'contrast').  Run
horizon_mask_from_dem.py afterwards to create their masks.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dem_io import read_dem  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SITES = ROOT / "backend" / "data" / "sites.json"


def find_pair(dem, lat, lon, box_km=10.0, ring_km=(2.5, 3.5)):
    cx, cy = dem.forward(lat, lon)
    c, r, h = int((cx - dem.x0) / dem.px), int((dem.y0 - cy) / dem.px), int(box_km * 1000 / dem.px)
    sub = dem.z[r - h:r + h, c - h:c + h]
    rr, cc = np.unravel_index(np.nanargmax(sub), sub.shape)
    R0, C0 = r - h + rr, c - h + cc
    k = int(ring_km[1] * 1000 / dem.px) + 1
    yy, xx = np.mgrid[-k:k + 1, -k:k + 1]
    dist = np.hypot(xx, yy) * dem.px
    win = dem.z[R0 - k:R0 + k + 1, C0 - k:C0 + k + 1].astype(float)
    win[(dist < ring_km[0] * 1000) | (dist > ring_km[1] * 1000)] = np.nan
    r2, c2 = np.unravel_index(np.nanargmin(win), win.shape)
    R1, C1 = R0 + r2 - k, C0 + c2 - k
    def ll(R, C):
        x, y = dem.x0 + (C + 0.5) * dem.px, dem.y0 - (R + 0.5) * dem.px
        rho = np.hypot(x, y)
        return (round(float(-90 + np.degrees(2 * np.arctan(rho / (2 * dem.R * dem.k0)))), 5),
                round(float(np.degrees(np.arctan2(x, y))), 5), round(float(dem.z[R, C]), 1))
    return ll(R0, C0), ll(R1, C1), round(float(dist[r2, c2]) / 1000, 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dem", required=True)
    ap.add_argument("--region", required=True)
    ap.add_argument("--tag", required=True)
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    data = json.loads(SITES.read_text(encoding="utf-8"))
    reg = next(s for s in data["sites"] if s["id"] == a.region)
    dem = read_dem(a.dem, Path(a.dem).name)
    crest, hollow, km = find_pair(dem, reg["lat"], reg["lon"])
    print(f"{reg['name']}: crest {crest}  hollow {hollow}  distance {km} km")
    if a.write:
        src = {"name": f"Selected from the LOLA 80 m DEM ({Path(a.dem).name}, NASA PGDA product 90, Barker et al. 2023) "
                       f"by scripts/find_contrast_pair.py inside the USGS {reg['name']} region",
               "url": "https://pgda.gsfc.nasa.gov/products/90"}
        data["sites"] = [s for s in data["sites"] if s.get("pair") != a.tag]
        for role, (la, lo, z) in (("crest", crest), ("hollow", hollow)):
            data["sites"].append({
                "id": f"pair-{a.tag}-{role}", "name": f"{reg['name']} · {'ridge' if role == 'crest' else 'hollow'}",
                "set": "contrast", "lat": la, "lon": lo, "coord_status": "derived", "pair": a.tag, "pair_role": role,
                "pair_distance_km": km, "surface_height_m": z,
                "coord_kind": ("highest DEM point within 10 km of the region centre" if role == "crest"
                               else "lowest DEM point 2.5-3.5 km from the ridge point"),
                "mission": f"3 km contrast pair in {reg['name']}", "source": src})
        SITES.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        print("written to", SITES)


if __name__ == "__main__":
    main()
