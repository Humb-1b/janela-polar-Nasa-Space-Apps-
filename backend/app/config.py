"""Central constants and settings."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
CACHE_DIR = Path(os.environ.get("JP_CACHE_DIR", BASE_DIR / ".cache"))

HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
HORIZONS_MAX_CONCURRENT = 2
HORIZONS_TIMEOUT_S = 60
HORIZONS_RETRIES = 3

MOON_RADIUS_KM = 1737.4          # given in the challenge brief / IAU mean radius
AU_KM = 149597870.7              # IAU 2012 definition
EARTH_EQ_RADIUS_KM = 6378.137    # WGS-84
EARTH_FLATTENING = 1 / 298.257223563  # WGS-84
# TT - UTC = 32.184 s + (TAI - UTC = 37 s, unchanged since 2017) = 69.184 s.
# Used only by the analytic model; 1 min of error moves the Moon ~0.01 deg.
DELTA_T_S = 69.184

SUN_RADIUS_DEG = 0.2666
DSN_MIN_ELEV_DEG = 10.0
DSN_SITES = {  # lat, lon_east (deg). From the team brief; alt not given -> 0 km.
    "goldstone": (35.4267, -116.89),
    "madrid": (40.4314, -4.2481),
    "canberra": (-35.4014, 148.9817),
}
