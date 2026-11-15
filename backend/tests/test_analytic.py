"""Offline tests of the analytic model.

Reference values for 1992-04-12 0h TD are Meeus' worked examples 47.a and
53.a (Astronomical Algorithms, 2nd ed.), typed from the book; the real-world
check against Horizons is scripts/horizons_probe.py.
"""
import math
from datetime import datetime, timedelta

import pytest

from app import analytic as A
from app.config import MOON_RADIUS_KM

JDE_1992 = 2448724.5  # 1992 April 12, 0h TD


def test_julian_day_j2000():
    assert A.julian_day(datetime(2000, 1, 1, 12)) == pytest.approx(2451545.0, abs=1e-9)


def test_meeus_47a_moon_position():
    lam, beta, dist = A.moon_geocentric(JDE_1992)
    assert lam == pytest.approx(133.162655, abs=2e-5)
    assert beta == pytest.approx(-3.229126, abs=2e-5)
    assert dist == pytest.approx(368409.7, abs=0.2)


def test_meeus_47a_fundamental_arguments():
    f = A.moon_fundamental(A.centuries(JDE_1992))
    assert f["Lp"] == pytest.approx(134.290182, abs=1e-5)
    assert f["D"] == pytest.approx(113.842304, abs=1e-5)
    assert f["M"] == pytest.approx(97.643514, abs=1e-5)
    assert f["Mp"] == pytest.approx(5.150833, abs=1e-5)
    assert f["F"] == pytest.approx(219.889721, abs=1e-5)
    assert f["E"] == pytest.approx(1.000194, abs=1e-6)


def test_meeus_53a_optical_libration():
    f = A.moon_fundamental(A.centuries(JDE_1992))
    lam, beta, _ = A.moon_geocentric(JDE_1992)
    assert f["Omega"] == pytest.approx(274.400656, abs=1e-5)
    lon, lat = A.selenographic_subpoint(lam, beta, f["Omega"], f["F"])
    assert lon == pytest.approx(-1.206, abs=2e-3)
    assert lat == pytest.approx(4.194, abs=2e-3)


def test_sun_meeus_25a():
    # Example 25.a: 1992 Oct 13.0 TD, true longitude 199.90988 deg, R = 0.99766 AU
    lam, _, r = A.sun_geocentric(2448908.5)
    assert lam == pytest.approx(199.90988, abs=2e-4)
    assert r / 149597870.7 == pytest.approx(0.99766, abs=2e-5)


DT = datetime(2026, 11, 15, 6, 0)


def test_sun_overhead_at_subsolar_point():
    st = A.moon_state(DT)
    r = A.sun_earth_altaz_on_moon(DT, st["subsolar_lat"], st["subsolar_lon"])
    assert r["sun"][1] > 89.99


def test_earth_overhead_at_subearth_point_and_parallax_at_limb():
    st = A.moon_state(DT)
    r = A.sun_earth_altaz_on_moon(DT, st["subearth_lat"], st["subearth_lon"])
    assert r["earth"][1] > 89.99
    # A point 90 deg away from the sub-Earth point sees Earth's centre *below* the
    # horizon by the parallax atan(R/d) (~0.25 deg): parallax lowers objects.
    lat = st["subearth_lat"] - 90 if st["subearth_lat"] > 0 else st["subearth_lat"] + 90
    r2 = A.sun_earth_altaz_on_moon(DT, lat, st["subearth_lon"])
    expected = math.degrees(math.atan(MOON_RADIUS_KM / st["earth_dist_km"]))
    assert r2["earth"][1] == pytest.approx(-expected, abs=0.01)


def test_south_pole_sun_is_near_horizon_and_earth_low():
    for h in range(0, 24 * 30, 37):
        r = A.sun_earth_altaz_on_moon(datetime(2026, 11, 1) + timedelta(hours=h), -89.9, 0)
        assert abs(r["sun"][1]) < 2.0     # |subsolar lat| <= ~1.6 deg
        assert abs(r["earth"][1]) < 7.5   # libration in latitude <= ~6.7 deg


def test_earth_moves_little_sun_moves_around_horizon():
    r0 = A.sun_earth_altaz_on_moon(DT, -85, 30)
    r1 = A.sun_earth_altaz_on_moon(datetime(2026, 11, 15, 18), -85, 30)
    # Southern hemisphere: Sun goes E -> N -> W, so azimuth DEcreases, ~12.2 deg/day
    sun_daz = (r0["sun"][0] - r1["sun"][0]) % 360
    assert 5 < sun_daz < 7.5
    assert abs(r1["earth"][1] - r0["earth"][1]) < 1.5


def test_moon_from_dsn_reasonable():
    el = [A.moon_altaz_from_earth(datetime(2026, 11, 15, h), 35.4267, -116.89)[1] for h in range(24)]
    assert max(el) > 10 and min(el) < -10   # rises and sets once a day
