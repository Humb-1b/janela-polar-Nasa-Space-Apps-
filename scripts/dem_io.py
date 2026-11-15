"""Minimal reader for the LOLA polar GeoTIFF DEMs (NASA PGDA, Barker et al. 2023).

Uses rasterio when installed.  Otherwise reads the file with tifffile and decodes
the tiles itself: Deflate (zlib) + TIFF floating-point predictor 3 (Adobe TIFF
Technical Note 3: per row, byte-wise horizontal differencing over the 4 byte
planes, most-significant byte plane first).  This avoids the optional
'imagecodecs' dependency.

Projection (from the GeoKeys): polar stereographic, origin -90, sphere
R = 1737400 m, scale 1, false easting/northing 0.  x = rho sin(lon), y = rho cos(lon),
rho = 2 R k0 tan((90 + lat)/2).
"""
from __future__ import annotations

import math
import zlib
from dataclasses import dataclass

import numpy as np


@dataclass
class DEM:
    z: np.ndarray            # (rows, cols) float32, metres; NaN = no data
    x0: float                # x of the left edge of column 0
    y0: float                # y of the top edge of row 0
    px: float                # pixel size (m)
    R: float = 1737400.0
    k0: float = 1.0
    name: str = ""

    def forward(self, lat, lon):
        rho = 2 * self.R * self.k0 * np.tan(np.radians(90.0 + np.asarray(lat)) / 2)
        a = np.radians(lon)
        return rho * np.sin(a), rho * np.cos(a)

    def sample(self, x, y):
        """Bilinear sample at projected (x, y); NaN outside the grid."""
        c = (np.asarray(x) - self.x0) / self.px - 0.5
        r = (self.y0 - np.asarray(y)) / self.px - 0.5
        c0, r0 = np.floor(c).astype(np.int64), np.floor(r).astype(np.int64)
        fc, fr = c - c0, r - r0
        rows, cols = self.z.shape
        ok = (c0 >= 0) & (r0 >= 0) & (c0 < cols - 1) & (r0 < rows - 1)
        c0c, r0c = np.clip(c0, 0, cols - 2), np.clip(r0, 0, rows - 2)
        z = self.z
        v = (z[r0c, c0c] * (1 - fc) * (1 - fr) + z[r0c, c0c + 1] * fc * (1 - fr)
             + z[r0c + 1, c0c] * (1 - fc) * fr + z[r0c + 1, c0c + 1] * fc * fr)
        return np.where(ok, v, np.nan)


def _undo_fp_predictor(raw: bytes, tw: int, tl: int) -> np.ndarray:
    b = np.frombuffer(raw, dtype=np.uint8).reshape(tl, tw * 4)
    b = np.cumsum(b, axis=1, dtype=np.uint8)              # undo byte differencing (mod 256)
    b = b.reshape(tl, 4, tw).transpose(0, 2, 1).copy()    # byte planes -> per-sample bytes, MSB first
    return b.view(">f4").reshape(tl, tw).astype(np.float32)


def read_dem(path: str, name: str = "") -> DEM:
    try:
        import rasterio  # noqa: F401
        return _read_rasterio(path, name)
    except ImportError:
        return _read_tifffile(path, name)


def _read_rasterio(path, name):
    import rasterio
    with rasterio.open(path) as ds:
        z = ds.read(1).astype(np.float32)
        if ds.nodata is not None and not math.isnan(ds.nodata):
            z[z == ds.nodata] = np.nan
        t = ds.transform
        crs = ds.crs.to_dict() if ds.crs else {}
        return DEM(z, t.c, t.f, t.a, R=float(crs.get("R", crs.get("a", 1737400.0))), k0=float(crs.get("k_0", crs.get("k", 1.0))), name=name)


def _read_tifffile(path, name):
    import tifffile
    with tifffile.TiffFile(path) as tf:
        pg = tf.pages[0]
        gk = tf.geotiff_metadata
        if gk.get("ProjNatOriginLatGeoKey") != -90.0:
            raise ValueError("expected a south polar stereographic DEM")
        if gk.get("GeogSemiMajorAxisGeoKey") != gk.get("GeogSemiMinorAxisGeoKey"):
            raise ValueError("expected a spherical datum")
        rows, cols = pg.shape
        tw, tl = pg.tilewidth, pg.tilelength
        z = np.empty((rows, cols), dtype=np.float32)
        fh = tf.filehandle
        ntx = -(-cols // tw)
        for k, (off, cnt) in enumerate(zip(pg.dataoffsets, pg.databytecounts)):
            fh.seek(off)
            raw = fh.read(cnt)
            if pg.compression == 8 or pg.compression == 32946:
                raw = zlib.decompress(raw)
            if pg.predictor == 3:
                tile = _undo_fp_predictor(raw, tw, tl)
            elif pg.predictor == 1:
                tile = np.frombuffer(raw, dtype=tf.byteorder + "f4").reshape(tl, tw)
            else:
                raise ValueError(f"unsupported predictor {pg.predictor}")
            ty, tx = divmod(k, ntx)
            r0, c0 = ty * tl, tx * tw
            h, w = min(tl, rows - r0), min(tw, cols - c0)
            z[r0:r0 + h, c0:c0 + w] = tile[:h, :w]
        sx, sy = gk["ModelPixelScale"][:2]
        tp = gk["ModelTiepoint"]
        if sx != sy:
            raise ValueError("non-square pixels")
        x0, y0 = tp[3] - tp[0] * sx, tp[4] + tp[1] * sy   # PixelIsArea: tiepoint at the pixel corner
        return DEM(z, x0, y0, sx, R=float(gk["GeogSemiMajorAxisGeoKey"]),
                   k0=float(gk.get("ProjScaleAtNatOriginGeoKey", 1.0)), name=name)
