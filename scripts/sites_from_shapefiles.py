#!/usr/bin/env python3
"""Artemis III region centres from the official USGS navigation grids.

Source: McClernan, M.T., 2024, Down Selected Artemis III Candidate Landing Site
Navigational Grids, USGS data release, doi:10.5066/P1MEQ6UK (regions sourced
from LROC QuickMap).  Input: the "1km Grid" shapefile of each region
(<Region>_PolarLGRS_ACC_1km_S_Grid.shp/.prj, optional <Region>_1km.xml).

    python scripts/sites_from_shapefiles.py /path/to/unzipped/folders [--write]

* reads the polygons with ``struct`` (pyshp not required);
* reads the projection from the .prj (USGS LPS: south polar stereographic on the
  1737.4 km sphere, false easting/northing 500 km, scale factor 0.994) and inverts
  it with pyproj when installed, otherwise with the closed-form spherical formula
  (Snyder 1987, eqs. 21-14/20-16); both are compared when pyproj is present;
* region centre = mean of the centres of all 1 km cells (projected), converted to
  lat/lon; bounding box from all vertices;
* cross-checks the bounding box against the westbc/eastbc/northbc/southbc of the
  FGDC metadata .xml when present;
* --write updates backend/data/sites.json (id a3-<slug>).
"""
from __future__ import annotations

import argparse
import json
import math
import re
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITES = ROOT / "backend" / "data" / "sites.json"


# ------------------------------------------------------------------ shapefile
def read_polygons(shp_path: Path) -> list[list[tuple[float, float]]]:
    """All rings of a Polygon (type 5) shapefile, as lists of (x, y)."""
    data = Path(shp_path).read_bytes()
    code, = struct.unpack(">i", data[0:4])
    if code != 9994:
        raise ValueError(f"{shp_path}: not a shapefile (file code {code})")
    stype, = struct.unpack("<i", data[32:36])
    if stype not in (5, 15, 25):
        raise ValueError(f"{shp_path}: shape type {stype} is not a polygon")
    rings, off = [], 100
    while off + 8 <= len(data):
        _, clen = struct.unpack(">ii", data[off:off + 8])
        rec = data[off + 8: off + 8 + 2 * clen]
        off += 8 + 2 * clen
        rtype, = struct.unpack("<i", rec[0:4])
        if rtype == 0:
            continue
        nparts, npts = struct.unpack("<ii", rec[36:44])
        parts = list(struct.unpack(f"<{nparts}i", rec[44:44 + 4 * nparts])) + [npts]
        p0 = 44 + 4 * nparts
        xy = struct.unpack(f"<{2 * npts}d", rec[p0:p0 + 16 * npts])
        pts = list(zip(xy[0::2], xy[1::2]))
        for a, b in zip(parts, parts[1:]):
            rings.append(pts[a:b])
    return rings


def ring_centroid(ring):
    """Area centroid of a closed ring (shoelace)."""
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
        c = x0 * y1 - x1 * y0
        a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c
    if abs(a) < 1e-12:
        return sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)
    return cx / (3 * a), cy / (3 * a)


# ------------------------------------------------------------------ projection
def parse_prj(text: str) -> dict:
    num = lambda k: float(re.search(rf'PARAMETER\["{k}",([-\d.eE]+)\]', text).group(1))
    if '"Stereographic"' not in text and '"Polar_Stereographic"' not in text:
        raise ValueError("expected a stereographic projection")
    R = float(re.search(r'SPHEROID\["[^"]*",([\d.]+),([\d.]+)\]', text).group(1))
    flat = float(re.search(r'SPHEROID\["[^"]*",([\d.]+),([\d.]+)\]', text).group(2))
    if flat != 0.0:
        raise ValueError("expected a sphere")
    lat0 = num("Latitude_Of_Origin")
    if lat0 != -90.0:
        raise ValueError("expected a south polar aspect")
    return {"R": R, "x0": num("False_Easting"), "y0": num("False_Northing"), "k0": num("Scale_Factor"),
            "lon0": num("Central_Meridian"), "wkt": text}


def inverse_spherical(x, y, p):
    """South-polar stereographic on a sphere -> (lat, lon_east)."""
    dx, dy = x - p["x0"], y - p["y0"]
    rho = math.hypot(dx, dy)
    c = 2 * math.atan(rho / (2 * p["R"] * p["k0"]))
    lat = -90.0 + math.degrees(c)
    lon = p["lon0"] + math.degrees(math.atan2(dx, dy))
    return lat, (lon + 180) % 360 - 180


def forward_spherical(lat, lon, p):
    rho = 2 * p["R"] * p["k0"] * math.tan(math.radians(90 + lat) / 2)
    a = math.radians(lon - p["lon0"])
    return p["x0"] + rho * math.sin(a), p["y0"] + rho * math.cos(a)


def make_inverse(p):
    try:
        from pyproj import CRS, Transformer
    except ImportError:
        return (lambda x, y: inverse_spherical(x, y, p)), "closed-form spherical inverse (pyproj not installed)"
    crs = CRS.from_wkt(p["wkt"])
    tr = Transformer.from_crs(crs, crs.geodetic_crs, always_xy=True)

    def inv(x, y):
        lon, lat = tr.transform(x, y)
        la2, lo2 = inverse_spherical(x, y, p)
        assert abs(lat - la2) < 1e-7 and abs(((lon - lo2 + 180) % 360) - 180) < 1e-7, "pyproj vs formula mismatch"
        return lat, (lon + 180) % 360 - 180
    return inv, "pyproj (checked against closed form)"


# ------------------------------------------------------------------ region
def xml_bbox(xml_path: Path):
    if not xml_path or not xml_path.exists():
        return None
    s = xml_path.read_text(encoding="utf-8", errors="replace")
    g = lambda t: float(re.search(rf"<{t}>\s*([-\d.]+)\s*</{t}>", s).group(1))
    try:
        return {"west": g("westbc"), "east": g("eastbc"), "north": g("northbc"), "south": g("southbc")}
    except AttributeError:
        return None


def region_from_shapefile(shp: Path, xml: Path | None = None) -> dict:
    p = parse_prj(shp.with_suffix(".prj").read_text())
    inv, how = make_inverse(p)
    rings = read_polygons(shp)
    cents = [ring_centroid(r) for r in rings]
    mx = sum(c[0] for c in cents) / len(cents)
    my = sum(c[1] for c in cents) / len(cents)
    lat, lon = inv(mx, my)
    ll = [inv(x, y) for r in rings for (x, y) in r]
    lats = [a for a, _ in ll]
    lons = [b for _, b in ll]
    bbox = {"west": min(lons), "east": max(lons), "north": max(lats), "south": min(lats)}
    out = {"lat": round(lat, 5), "lon": round(lon, 5), "n_cells": len(rings), "bbox": {k: round(v, 4) for k, v in bbox.items()},
           "extent_km": [round((max(r[0] for g in rings for r in g) - min(r[0] for g in rings for r in g)) / 1000, 1),
                         round((max(r[1] for g in rings for r in g) - min(r[1] for g in rings for r in g)) / 1000, 1)],
           "projection": f"stereographic S pole, R={p['R']:.0f} m, k0={p['k0']}, FE/FN={p['x0']:.0f}/{p['y0']:.0f}",
           "inverse": how}
    xb = xml_bbox(xml)
    if xb:
        # Observed in all 8 USGS regions: one axis of the metadata box matches the
        # grid exactly (validating the inverse projection); the other axis of the
        # metadata box is narrower than the actual grid.  So we require >= 1
        # matching bounds (Malapert: 1; its grid has an extra 22nd row) and the centre
        # inside the metadata box.
        out["xml_bbox"] = xb
        out["xml_bounds_matching"] = sum(abs(bbox[k] - xb[k]) < 2e-3 for k in xb)
        out["centre_inside_xml_bbox"] = xb["south"] <= lat <= xb["north"] and xb["west"] <= lon <= xb["east"]
        if out["xml_bounds_matching"] < 1 or not out["centre_inside_xml_bbox"]:
            raise ValueError(f"{shp.name}: projection check against metadata failed: {out}")
    return out


def slug(name: str) -> str:
    return "a3-" + name.lower().replace("_", "-").replace(" ", "-")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder", type=Path)
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    found = {}
    for shp in sorted(a.folder.rglob("*_PolarLGRS_ACC_1km_S_Grid.shp")):
        region = shp.name.split("_PolarLGRS")[0]
        xml = shp.parent / f"{region}_1km.xml"
        r = region_from_shapefile(shp, xml)
        found[slug(region)] = r
        print(f"{region:22s} {r['lat']:10.5f} {r['lon']:10.5f}  cells={r['n_cells']:4d}  "
              f"extent={r['extent_km'][0]}x{r['extent_km'][1]} km  xml: {r.get('xml_bounds_matching')}/4 bounds equal, "
              f"centre inside={r.get('centre_inside_xml_bbox')}")
    if not found:
        print("no *_PolarLGRS_ACC_1km_S_Grid.shp found"); return 1
    print("inverse:", next(iter(found.values()))["inverse"])
    if a.write:
        data = json.loads(SITES.read_text(encoding="utf-8"))
        n = 0
        for s in data["sites"]:
            r = found.get(s["id"])
            if not r:
                continue
            s.update({"lat": r["lat"], "lon": r["lon"], "coord_status": "verified",
                      "coord_kind": f"region centre: mean of the {r['n_cells']} USGS 1 km LGRS grid cells",
                      "region_bbox": r["bbox"], "region_extent_km": r["extent_km"]})
            n += 1
        SITES.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"updated {n} sites in {SITES}")
        missing = [s["name"] for s in data["sites"] if s["set"] == "artemis3" and s["lat"] is None]
        if missing:
            print("still pending:", ", ".join(missing))
    return 0


if __name__ == "__main__":
    sys.exit(main())
