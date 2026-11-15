"""Analytic fallback ephemeris for Janela Polar.

Sources (Jean Meeus, *Astronomical Algorithms*, 2nd ed., Willmann-Bell 1998):
  * ch. 12  Greenwich mean sidereal time
  * ch. 22  mean obliquity of the ecliptic
  * ch. 25  Sun, low-accuracy theory
  * ch. 47  Moon (full Tables 47.A / 47.B)
  * ch. 53  optical libration / selenographic sub-points, I = 1.54242 deg

All angles are degrees unless the name ends in _rad.  Times enter as UTC
datetimes; Meeus' theories use TT, so a fixed DELTA_T is added (see config).

Frame: everything is computed in the mean ecliptic & equinox of date.  Meeus'
libration uses W = lambda - dpsi - Omega with apparent lambda, i.e. the
mean-of-date lambda, so nutation cancels and is not modelled.  Physical
libration (< ~0.04 deg) and aberration (~0.006 deg) are neglected.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone

from .config import DELTA_T_S, MOON_RADIUS_KM, AU_KM, EARTH_EQ_RADIUS_KM, EARTH_FLATTENING

I_MOON = 1.54242  # mean inclination of lunar equator to ecliptic (Meeus ch. 53)

D2R = math.pi / 180.0
R2D = 180.0 / math.pi


def _sin(x):
    return math.sin(x * D2R)


def _cos(x):
    return math.cos(x * D2R)


def norm360(x):
    return x % 360.0


def norm180(x):
    x = (x + 180.0) % 360.0 - 180.0
    return x


# ---------------------------------------------------------------- time
def julian_day(dt: datetime) -> float:
    """Julian Day (UTC scale) for an aware or naive-UTC datetime."""
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    unix = (dt - datetime(1970, 1, 1)).total_seconds()
    return unix / 86400.0 + 2440587.5


def jd_tt(dt: datetime) -> float:
    return julian_day(dt) + DELTA_T_S / 86400.0


def centuries(jd: float) -> float:
    return (jd - 2451545.0) / 36525.0


# ---------------------------------------------------------------- Moon, ch. 47
# (D, M, M', F, sum_l [1e-6 deg], sum_r [1e-3 km])
_TAB_47A = (
    (0, 0, 1, 0, 6288774, -20905355), (2, 0, -1, 0, 1274027, -3699111),
    (2, 0, 0, 0, 658314, -2955968), (0, 0, 2, 0, 213618, -569925),
    (0, 1, 0, 0, -185116, 48888), (0, 0, 0, 2, -114332, -3149),
    (2, 0, -2, 0, 58793, 246158), (2, -1, -1, 0, 57066, -152138),
    (2, 0, 1, 0, 53322, -170733), (2, -1, 0, 0, 45758, -204586),
    (0, 1, -1, 0, -40923, -129620), (1, 0, 0, 0, -34720, 108743),
    (0, 1, 1, 0, -30383, 104755), (2, 0, 0, -2, 15327, 10321),
    (0, 0, 1, 2, -12528, 0), (0, 0, 1, -2, 10980, 79661),
    (4, 0, -1, 0, 10675, -34782), (0, 0, 3, 0, 10034, -23210),
    (4, 0, -2, 0, 8548, -21636), (2, 1, -1, 0, -7888, 24208),
    (2, 1, 0, 0, -6766, 30824), (1, 0, -1, 0, -5163, -8379),
    (1, 1, 0, 0, 4987, -16675), (2, -1, 1, 0, 4036, -12831),
    (2, 0, 2, 0, 3994, -10445), (4, 0, 0, 0, 3861, -11650),
    (2, 0, -3, 0, 3665, 14403), (0, 1, -2, 0, -2689, -7003),
    (2, 0, -1, 2, -2602, 0), (2, -1, -2, 0, 2390, 10056),
    (1, 0, 1, 0, -2348, 6322), (2, -2, 0, 0, 2236, -9884),
    (0, 1, 2, 0, -2120, 5751), (0, 2, 0, 0, -2069, 0),
    (2, -2, -1, 0, 2048, -4950), (2, 0, 1, -2, -1773, 4130),
    (2, 0, 0, 2, -1595, 0), (4, -1, -1, 0, 1215, -3958),
    (0, 0, 2, 2, -1110, 0), (3, 0, -1, 0, -892, 3258),
    (2, 1, 1, 0, -810, 2616), (4, -1, -2, 0, 759, -1897),
    (0, 2, -1, 0, -713, -2117), (2, 2, -1, 0, -700, 2354),
    (2, 1, -2, 0, 691, 0), (2, -1, 0, -2, 596, 0),
    (4, 0, 1, 0, 549, -1423), (0, 0, 4, 0, 537, -1117),
    (4, -1, 0, 0, 520, -1571), (1, 0, -2, 0, -487, -1739),
    (2, 1, 0, -2, -399, 0), (0, 0, 2, -2, -381, -4421),
    (1, 1, 1, 0, 351, 0), (3, 0, -2, 0, -340, 0),
    (4, 0, -3, 0, 330, 0), (2, -1, 2, 0, 327, 0),
    (0, 2, 1, 0, -323, 1165), (1, 1, -1, 0, 299, 0),
    (2, 0, 3, 0, 294, 0), (2, 0, -1, -2, 0, 8752),
)
# (D, M, M', F, sum_b [1e-6 deg])
_TAB_47B = (
    (0, 0, 0, 1, 5128122), (0, 0, 1, 1, 280602), (0, 0, 1, -1, 277693),
    (2, 0, 0, -1, 173237), (2, 0, -1, 1, 55413), (2, 0, -1, -1, 46271),
    (2, 0, 0, 1, 32573), (0, 0, 2, 1, 17198), (2, 0, 1, -1, 9266),
    (0, 0, 2, -1, 8822), (2, -1, 0, -1, 8216), (2, 0, -2, -1, 4324),
    (2, 0, 1, 1, 4200), (2, 1, 0, -1, -3359), (2, -1, -1, 1, 2463),
    (2, -1, 0, 1, 2211), (2, -1, -1, -1, 2065), (0, 1, -1, -1, -1870),
    (4, 0, -1, -1, 1828), (0, 1, 0, 1, -1794), (0, 0, 0, 3, -1749),
    (0, 1, -1, 1, -1565), (1, 0, 0, 1, -1491), (0, 1, 1, 1, -1475),
    (0, 1, 1, -1, -1410), (0, 1, 0, -1, -1344), (1, 0, 0, -1, -1335),
    (0, 0, 3, 1, 1107), (4, 0, 0, -1, 1021), (4, 0, -1, 1, 833),
    (0, 0, 1, -3, 777), (4, 0, -2, 1, 671), (2, 0, 0, -3, 607),
    (2, 0, 2, -1, 596), (2, -1, 1, -1, 491), (2, 0, -2, 1, -451),
    (0, 0, 3, -1, 439), (2, 0, 2, 1, 422), (2, 0, -3, -1, 421),
    (2, 1, -1, 1, -366), (2, 1, 0, 1, -351), (4, 0, 0, 1, 331),
    (2, -1, 1, 1, 315), (2, -2, 0, -1, 302), (0, 0, 1, 3, -283),
    (2, 1, 1, -1, -229), (1, 1, 0, -1, 223), (1, 1, 0, 1, 223),
    (0, 1, -2, -1, -220), (2, 1, -1, -1, -220), (1, 0, 1, 1, -185),
    (2, -1, -2, -1, 181), (0, 1, 2, 1, -177), (4, 0, -2, -1, 176),
    (4, -1, -1, -1, 166), (1, 0, 1, -1, -164), (4, 0, 1, -1, 132),
    (1, 0, -1, -1, -119), (4, -1, 0, -1, 115), (2, -2, 0, 1, 107),
)


def moon_fundamental(T: float) -> dict:
    T2, T3, T4 = T * T, T ** 3, T ** 4
    return {
        "Lp": norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000),
        "D": norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000),
        "M": norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000),
        "Mp": norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000),
        "F": norm360(93.2720950 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000),
        "Omega": norm360(125.0445479 - 1934.1362891 * T + 0.0020754 * T2 + T3 / 467441 - T4 / 60616000),
        "E": 1 - 0.002516 * T - 0.0000074 * T2,
        "A1": norm360(119.75 + 131.849 * T),
        "A2": norm360(53.09 + 479264.290 * T),
        "A3": norm360(313.45 + 481266.484 * T),
    }


def moon_geocentric(jde: float):
    """Geometric geocentric Moon: (lambda, beta, distance_km), mean ecliptic of date."""
    f = moon_fundamental(centuries(jde))
    D, M, Mp, F, E = f["D"], f["M"], f["Mp"], f["F"], f["E"]
    sl = sr = sb = 0.0
    for d, m, mp, ff, cl, cr in _TAB_47A:
        e = E ** abs(m)
        arg = d * D + m * M + mp * Mp + ff * F
        sl += cl * e * _sin(arg)
        sr += cr * e * _cos(arg)
    for d, m, mp, ff, cb in _TAB_47B:
        sb += cb * (E ** abs(m)) * _sin(d * D + m * M + mp * Mp + ff * F)
    Lp, A1, A2, A3 = f["Lp"], f["A1"], f["A2"], f["A3"]
    sl += 3958 * _sin(A1) + 1962 * _sin(Lp - F) + 318 * _sin(A2)
    sb += (-2235 * _sin(Lp) + 382 * _sin(A3) + 175 * _sin(A1 - F)
           + 175 * _sin(A1 + F) + 127 * _sin(Lp - Mp) - 115 * _sin(Lp + Mp))
    return norm360(Lp + sl / 1e6), sb / 1e6, 385000.56 + sr / 1000.0


# ---------------------------------------------------------------- Sun, ch. 25
def sun_geocentric(jde: float):
    """Geometric geocentric Sun: (lambda, beta=0, distance_km), mean equinox of date."""
    T = centuries(jde)
    L0 = norm360(280.46646 + 36000.76983 * T + 0.0003032 * T * T)
    M = norm360(357.52911 + 35999.05029 * T - 0.0001537 * T * T)
    e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T
    C = ((1.914602 - 0.004817 * T - 0.000014 * T * T) * _sin(M)
         + (0.019993 - 0.000101 * T) * _sin(2 * M) + 0.000289 * _sin(3 * M))
    nu = M + C
    R_au = 1.000001018 * (1 - e * e) / (1 + e * _cos(nu))
    return norm360(L0 + C), 0.0, R_au * AU_KM


# ---------------------------------------------------------------- vectors
def sph2vec(lon, lat, r=1.0):
    return (r * _cos(lat) * _cos(lon), r * _cos(lat) * _sin(lon), r * _sin(lat))


def vec2sph(v):
    x, y, z = v
    r = math.sqrt(x * x + y * y + z * z)
    return norm360(math.atan2(y, x) * R2D), math.asin(z / r) * R2D, r


# ---------------------------------------------------------------- libration, ch. 53
def selenographic_subpoint(lam: float, beta: float, Omega: float, F: float):
    """Meeus 53 optical libration formulas.

    Input: ecliptic direction (mean of date) *from the body to the Moon*
    (geocentric Moon for the sub-Earth point, heliocentric Moon for the
    sub-solar point).  Output: (lon_east in (-180,180], lat) of the point on
    the Moon directly under that body.
    """
    W = lam - Omega
    A = math.atan2(_sin(W) * _cos(beta) * _cos(I_MOON) - _sin(beta) * _sin(I_MOON),
                   _cos(W) * _cos(beta)) * R2D
    lon = norm180(A - F)
    lat = math.asin(-_sin(W) * _cos(beta) * _sin(I_MOON) - _sin(beta) * _cos(I_MOON)) * R2D
    return lon, lat


def moon_state(dt: datetime) -> dict:
    """Sub-Earth and sub-solar selenographic points plus distances."""
    jde = jd_tt(dt)
    f = moon_fundamental(centuries(jde))
    lm, bm, dm = moon_geocentric(jde)
    ls, _, ds = sun_geocentric(jde)
    m_vec = sph2vec(lm, bm, dm)
    s_vec = sph2vec(ls, 0.0, ds)
    h_vec = tuple(a - b for a, b in zip(m_vec, s_vec))  # Sun -> Moon
    lh, bh, dh = vec2sph(h_vec)
    e_lon, e_lat = selenographic_subpoint(lm, bm, f["Omega"], f["F"])
    s_lon, s_lat = selenographic_subpoint(lh, bh, f["Omega"], f["F"])
    return {"subearth_lon": e_lon, "subearth_lat": e_lat, "earth_dist_km": dm,
            "subsolar_lon": s_lon, "subsolar_lat": s_lat, "sun_dist_km": dh,
            "moon_lambda": lm, "moon_beta": bm, "sun_lambda": ls}


# ---------------------------------------------------------------- topocentric
def _enu_altaz(target, site, lat, lon):
    v = tuple(a - b for a, b in zip(target, site))
    e = (-_sin(lon), _cos(lon), 0.0)
    n = (-_sin(lat) * _cos(lon), -_sin(lat) * _sin(lon), _cos(lat))
    u = (_cos(lat) * _cos(lon), _cos(lat) * _sin(lon), _sin(lat))
    ve = sum(a * b for a, b in zip(v, e))
    vn = sum(a * b for a, b in zip(v, n))
    vu = sum(a * b for a, b in zip(v, u))
    az = norm360(math.atan2(ve, vn) * R2D)  # clockwise from north, as Horizons
    el = math.atan2(vu, math.hypot(ve, vn)) * R2D
    return az, el, math.sqrt(ve * ve + vn * vn + vu * vu)


def sun_earth_altaz_on_moon(dt: datetime, lat: float, lon_east: float, alt_km: float = 0.0) -> dict:
    """Topocentric (airless) az/el of Sun and Earth for a lunar surface point.

    Spherical Moon of radius MOON_RADIUS_KM; parallax included.
    Returns {'sun': (az, el, dist_km), 'earth': (az, el, dist_km), 'state': {...}}.
    """
    st = moon_state(dt)
    site = sph2vec(lon_east, lat, MOON_RADIUS_KM + alt_km)
    sun = sph2vec(st["subsolar_lon"], st["subsolar_lat"], st["sun_dist_km"])
    earth = sph2vec(st["subearth_lon"], st["subearth_lat"], st["earth_dist_km"])
    return {"sun": _enu_altaz(sun, site, lat, lon_east),
            "earth": _enu_altaz(earth, site, lat, lon_east), "state": st}


def gmst_deg(dt: datetime) -> float:
    jd = julian_day(dt)
    T = centuries(jd)
    return norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0)
                   + 0.000387933 * T * T - T ** 3 / 38710000.0)


def mean_obliquity(jde: float) -> float:
    T = centuries(jde)
    return 23.0 + 26.0 / 60 + (21.448 - 46.8150 * T - 0.00059 * T * T + 0.001813 * T ** 3) / 3600.0


def moon_altaz_from_earth(dt: datetime, lat: float, lon_east: float, alt_km: float = 0.0):
    """Topocentric az/el (no refraction) of the Moon for an Earth site (e.g. a DSN complex)."""
    jde = jd_tt(dt)
    lm, bm, dm = moon_geocentric(jde)
    eps = mean_obliquity(jde)
    x, y, z = sph2vec(lm, bm, dm)
    # ecliptic -> equatorial (mean of date)
    ye = y * _cos(eps) - z * _sin(eps)
    ze = y * _sin(eps) + z * _cos(eps)
    # equatorial -> Earth-fixed (rotate by GMST)
    g = gmst_deg(dt)
    xf = x * _cos(g) + ye * _sin(g)
    yf = -x * _sin(g) + ye * _cos(g)
    # geodetic site position (WGS-84 style ellipsoid)
    a, fl = EARTH_EQ_RADIUS_KM, EARTH_FLATTENING
    e2 = fl * (2 - fl)
    N = a / math.sqrt(1 - e2 * _sin(lat) ** 2)
    site = ((N + alt_km) * _cos(lat) * _cos(lon_east), (N + alt_km) * _cos(lat) * _sin(lon_east),
            (N * (1 - e2) + alt_km) * _sin(lat))
    return _enu_altaz((xf, yf, ze), site, lat, lon_east)
