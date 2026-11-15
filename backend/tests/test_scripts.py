"""Offline tests of the data-preparation scripts (synthetic inputs only)."""
import struct
import sys
import zlib
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import dem_io  # noqa: E402
import horizon_mask_from_dem as H  # noqa: E402
import sites_from_shapefiles as SF  # noqa: E402
from app import windows as W  # noqa: E402

# Same parameters as the USGS LPS .prj shipped with the Artemis III grids
PRJ = ('PROJCS["Moon_2015_-_Sphere_Ocentric_South_Polar",GEOGCS["GCS_Moon_2015_-_Sphere_Ocentric",'
       'DATUM["D_Moon_2015_-_Sphere",SPHEROID["Moon_2015_-_Sphere",1737400.0,0.0]],PRIMEM["Reference_Meridian",0.0],'
       'UNIT["Degree",0.0174532925199433]],PROJECTION["Stereographic"],PARAMETER["False_Easting",500000.0],'
       'PARAMETER["False_Northing",500000.0],PARAMETER["Central_Meridian",0.0],PARAMETER["Scale_Factor",0.994],'
       'PARAMETER["Latitude_Of_Origin",-90.0],UNIT["Meter",1.0]]')


def write_polygon_shp(path: Path, squares):
    """Minimal Polygon shapefile writer (main file only) for the test."""
    recs = b""
    for i, (x, y, s) in enumerate(squares, 1):
        pts = [(x, y), (x, y + s), (x + s, y + s), (x + s, y), (x, y)]
        content = struct.pack("<i4dii", 5, x, y, x + s, y + s, 1, 5) + struct.pack("<i", 0)
        content += b"".join(struct.pack("<2d", *p) for p in pts)
        recs += struct.pack(">ii", i, len(content) // 2) + content
    hdr = struct.pack(">i5ii", 9994, 0, 0, 0, 0, 0, (100 + len(recs)) // 2) + struct.pack("<ii4d4d", 1000, 5, 0, 0, 0, 0, 0, 0, 0, 0)
    path.write_bytes(hdr + recs)
    path.with_suffix(".prj").write_text(PRJ)


def test_projection_roundtrip_and_pole():
    p = SF.parse_prj(PRJ)
    assert p["k0"] == 0.994 and p["x0"] == 500000.0
    for lat, lon in ((-85.42, 31.7), (-88.2, -65.1), (-83.6, -68.7), (-89.99, 120.0)):
        x, y = SF.forward_spherical(lat, lon, p)
        la, lo = SF.inverse_spherical(x, y, p)
        assert la == pytest.approx(lat, abs=1e-9) and lo == pytest.approx(lon, abs=1e-9)
    assert SF.inverse_spherical(500000.0, 500000.0, p)[0] == pytest.approx(-90.0)
    # lon 0 lies toward +y, lon 90E toward +x (south polar aspect)
    x, y = SF.forward_spherical(-85, 0, p); assert x == pytest.approx(500000) and y > 500000
    x, y = SF.forward_spherical(-85, 90, p); assert x > 500000 and y == pytest.approx(500000)


def test_synthetic_shapefile_centre(tmp_path):
    p = SF.parse_prj(PRJ)
    cx, cy = SF.forward_spherical(-86.0, 10.0, p)
    squares = [(cx - 1500 + 1000 * i, cy - 1500 + 1000 * j, 1000.0) for i in range(3) for j in range(3)]
    shp = tmp_path / "Test_PolarLGRS_ACC_1km_S_Grid.shp"
    write_polygon_shp(shp, squares)
    assert len(SF.read_polygons(shp)) == 9
    r = SF.region_from_shapefile(shp)
    assert r["lat"] == pytest.approx(-86.0, abs=1e-5) and r["lon"] == pytest.approx(10.0, abs=1e-4)
    assert r["n_cells"] == 9 and r["extent_km"] == [3.0, 3.0]


def test_shapefile_rejects_non_polygon(tmp_path):
    f = tmp_path / "x.shp"
    f.write_bytes(struct.pack(">i", 9994) + b"\0" * 28 + struct.pack("<i", 1) + b"\0" * 64)
    with pytest.raises(ValueError):
        SF.read_polygons(f)


def test_floating_point_predictor_decoding():
    """Encode a known tile with TIFF predictor 3 + deflate, decode with dem_io."""
    tw, tl = 8, 3
    vals = (np.arange(tw * tl, dtype=np.float32).reshape(tl, tw) * 37.5 - 400.25).astype(">f4")
    b = vals.view(np.uint8).reshape(tl, tw, 4).transpose(0, 2, 1).reshape(tl, tw * 4)  # byte planes, MSB first
    enc = b.copy()
    enc[:, 1:] = (b[:, 1:].astype(np.int16) - b[:, :-1].astype(np.int16)) % 256
    raw = zlib.decompress(zlib.compress(enc.astype(np.uint8).tobytes()))
    out = dem_io._undo_fp_predictor(raw, tw, tl)
    assert np.array_equal(out, vals.astype(np.float32))


def _flat_dem(n=2001, px=80.0):
    return dem_io.DEM(np.zeros((n, n), np.float32), -n / 2 * px, n / 2 * px, px)


def test_dem_bilinear_and_outside():
    d = _flat_dem(11, 10.0)
    d.z[:] = np.arange(11, dtype=np.float32)[None, :]   # z grows with column (x)
    assert float(d.sample(np.array([0.0]), np.array([0.0]))[0]) == pytest.approx(5.0)
    assert float(d.sample(np.array([5.0]), np.array([0.0]))[0]) == pytest.approx(5.5)
    assert np.isnan(d.sample(np.array([1e6]), np.array([0.0]))[0])


def test_synthetic_hill_blocks_only_the_east():
    dem = _flat_dem(3001)
    lat, lon = -88.0, 0.0
    (x0, y0), north, east = H.local_axes(dem, lat, lon)
    assert north[1] > 0.99 and abs(north[0]) < 1e-6 and east[0] > 0.99   # lon 0: north = +y, east = +x
    n = dem.z.shape[0]
    xs = dem.x0 + (np.arange(n) + 0.5) * dem.px
    ys = dem.y0 - (np.arange(n) + 0.5) * dem.px
    X, Y = np.meshgrid(xs, ys)
    hx, hy = x0 + east[0] * 20000, y0 + east[1] * 20000
    dem.z[:] = (500 * np.exp(-(((X - hx) ** 2 + (Y - hy) ** 2) / (2 * 1500 ** 2)))).astype(np.float32)
    m, info = H.horizon_mask([dem], lat, lon, max_km=50, observer_m=0)
    expected = np.degrees(np.arctan((500 - 20000 ** 2 / (2 * H.R_MOON)) / 20000))
    assert m[90] == pytest.approx(expected, abs=0.05)
    for az in (0, 180, 270, 45, 135):
        assert m[az] < 0.05
    # curvature: on flat ground the horizon dips below 0 (by d/2R at the first sample)
    assert m[270] < 0


def test_mask_at_accepts_numpy_arrays():
    m = np.zeros(360); m[10] = 2.0
    assert W.mask_at(m, 10) == 2.0 and W.mask_at(None, 3) == 0.0
