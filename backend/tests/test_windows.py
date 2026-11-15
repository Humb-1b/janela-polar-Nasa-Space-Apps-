import math
from datetime import datetime, timedelta

import pytest

from app import windows as W
from app.config import MOON_RADIUS_KM, SUN_RADIUS_DEG


# ---- disc fraction
def test_disc_fraction_limits_and_half():
    assert W.disc_fraction(1.0, 0.0) == 1.0
    assert W.disc_fraction(-1.0, 0.0) == 0.0
    assert W.disc_fraction(0.0, 0.0) == pytest.approx(0.5)
    assert W.disc_fraction(2.0, 2.0) == pytest.approx(0.5)


def test_disc_fraction_symmetry_and_monotonic():
    xs = [i * 0.01 - 0.3 for i in range(61)]
    fr = [W.disc_fraction(x, 0.0) for x in xs]
    assert all(b >= a for a, b in zip(fr, fr[1:]))
    for d in (0.05, 0.1, 0.2):
        assert W.disc_fraction(d, 0) + W.disc_fraction(-d, 0) == pytest.approx(1.0)


def test_disc_fraction_matches_numeric_integration():
    r, d = SUN_RADIUS_DEG, 0.1
    n = 20000
    above = sum(2 * math.sqrt(r * r - y * y) * (2 * r / n)
                for y in (-r + (i + 0.5) * 2 * r / n for i in range(n)) if y > -d)
    assert W.disc_fraction(d, 0.0) == pytest.approx(above / (math.pi * r * r), abs=1e-4)


# ---- horizon depression
def test_depression():
    assert W.depression_deg(0) == 0.0
    h = 10.0
    assert W.depression_deg(h) == pytest.approx(math.degrees(math.acos(MOON_RADIUS_KM * 1000 / (MOON_RADIUS_KM * 1000 + h))))
    # small-angle check: sqrt(2h/R) rad
    assert W.depression_deg(h) == pytest.approx(math.degrees(math.sqrt(2 * h / (MOON_RADIUS_KM * 1000))), rel=1e-3)
    assert W.depression_deg(1.8) < W.depression_deg(10) < W.depression_deg(100)


# ---- mask interpolation / effective horizon
def test_mask_interpolation_and_wrap():
    m = [0.0] * 360
    m[90], m[359] = 2.0, 1.0
    assert W.mask_at(m, 90) == 2.0
    assert W.mask_at(m, 89.5) == pytest.approx(1.0)
    assert W.mask_at(m, 359.5) == pytest.approx(0.5)  # wraps to index 0
    assert W.mask_at(None, 123) == 0.0
    assert W.effective_horizon(90, m, margin_deg=0.5, height_m=0) == pytest.approx(2.5)
    assert W.effective_horizon(90, m, 0, height_m=10) < 2.0


# ---- synthetic series helpers
T0 = datetime(2026, 11, 15)
STEP = timedelta(hours=1)


def series(n, sun_el, earth_el, dsn_el, sun_az=None, earth_az=None):
    return {"times": [T0 + i * STEP for i in range(n)],
            "sun_az": sun_az or [90.0] * n, "sun_el": sun_el,
            "earth_az": earth_az or [0.0] * n, "earth_el": earth_el,
            "dsn": {"goldstone": dsn_el, "madrid": [None] * n, "canberra": [-50.0] * n}}


def test_rules_sun_dte_ideal():
    n = 6
    s = series(n, sun_el=[1, 1, 0.1, -0.1, -1, 1], earth_el=[1, -1, 1, 1, 1, 1],
               dsn_el=[20, 20, 5, 20, 20, 20])
    ev = W.evaluate(s)
    assert ev["sun"] == [True, True, True, False, False, True]
    assert ev["dte"] == [True, False, False, True, True, True]
    assert ev["ideal"] == [True, False, False, False, False, True]
    assert ev["dsn_active"][0] == ["goldstone"]


def test_mask_blocks_only_its_azimuth():
    mask = [0.0] * 360
    for a in range(80, 101):
        mask[a] = 3.0            # hill to the east
    n = 2
    east = series(n, [1.0, 1.0], [5, 5], [20, 20], sun_az=[90.0, 90.0])
    west = series(n, [1.0, 1.0], [5, 5], [20, 20], sun_az=[270.0, 270.0])
    assert W.evaluate(east, mask)["sun"] == [False, False]
    assert W.evaluate(west, mask)["sun"] == [True, True]


def test_margin_and_dsn_threshold():
    s = series(1, [0.3], [0.3], [12])
    assert W.evaluate(s)["ideal"] == [True]
    assert W.evaluate(s, margin_deg=0.5)["ideal"] == [False]
    assert W.evaluate(s, dsn_min_el=15)["dte"] == [False]


def test_intervals_edges_and_summary():
    n = 48
    sun = [1.0 if 2 <= i < 30 else -1.0 for i in range(n)]
    dte = [20] * n
    s = series(n, sun, [5] * n, dte)
    ev = W.evaluate(s)
    iv = W.intervals(s["times"], ev["sun"], STEP)
    assert iv == [(T0 + 2 * STEP, T0 + 30 * STEP)]
    summ = W.summarize(s, ev, return_hours=24)
    assert summ["sun_hours"] == pytest.approx(28)
    assert summ["longest_night_hours"] == pytest.approx(18)
    rw = summ["return_windows"]
    assert len(rw) == 1 and rw[0]["latest_start"] == T0 + 6 * STEP and rw[0]["sunset"] == T0 + 30 * STEP
    assert W.summarize(s, ev, return_hours=4)["return_windows"][0]["hours"] == pytest.approx(28)
    assert summ["status"] == "dte_only" and summ["next_sunrise"] == T0 + 2 * STEP


def test_interval_running_to_end_is_clipped():
    s = series(5, [1] * 5, [1] * 5, [20] * 5)
    ev = W.evaluate(s)
    iv = W.intervals(s["times"], ev["ideal"], STEP)
    assert iv == [(T0, T0 + 5 * STEP)]
    summ = W.summarize(s, ev, return_hours=4)
    assert summ["status"] == "ideal" and summ["next_sunset"] is None
    assert len(summ["return_windows"]) == 1
