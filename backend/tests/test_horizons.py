"""Offline tests of the Horizons client (no network)."""
import json
from pathlib import Path

import pytest
import requests

from app import config, horizons

FIX = Path(__file__).parent / "fixtures"

# SYNTHETIC excerpt in the layout of a Horizons CSV observer table, written by
# hand for the parser test (numbers are placeholders, not ephemeris data).
# A real response is saved in fixtures/real/ by scripts/horizons_probe.py.
SYNTH = """*******************************************************************************
 Date__(UT)__HR:MN, , , Azi_(a-app), Elev_(a-app),
*******************************************************************************
$$SOE
 2026-Nov-15 00:00, , , 10.000000, -1.000000,
 2026-Nov-15 01:00,*, , 11.000000, n.a.,
$$EOE
*******************************************************************************
"""


def test_parse_by_header_name_and_na():
    rows = horizons.parse_table(SYNTH)
    assert len(rows) == 2
    s = horizons.azel_series(rows)
    assert s[0][1:] == (10.0, -1.0)
    assert s[1][2] is None
    assert s[1][0].hour == 1


def test_parse_missing_markers():
    with pytest.raises(horizons.HorizonsError):
        horizons.parse_table("no table here")


def test_params_and_site_coord():
    p = horizons.observer_params("10", "301", -85.5, -10.0, "2026-11-15", "2026-11-16")
    assert p["CENTER"] == "'coord@301'"
    assert p["SITE_COORD"] == "'350.000000,-85.500000,0.0000'"
    assert p["APPARENT"] == "'AIRLESS'" and p["QUANTITIES"] == "'4'"
    assert "format=text" in horizons.text_url(p)


class FakeResp:
    def __init__(self, code, payload):
        self.status_code, self._p, self.text = code, payload, json.dumps(payload)

    def json(self):
        return self._p


class FakeSession:
    def __init__(self, responses):
        self.responses, self.calls = list(responses), 0

    def get(self, *a, **k):
        self.calls += 1
        r = self.responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


@pytest.fixture(autouse=True)
def tmp_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CACHE_DIR", tmp_path)
    monkeypatch.setattr(horizons, "_cache", None)
    monkeypatch.setattr(horizons.time, "sleep", lambda s: None)


def test_retry_on_5xx_then_success_and_cache():
    sess = FakeSession([FakeResp(503, {}), requests.ConnectionError("x"), FakeResp(200, {"result": SYNTH})])
    p = {"a": 1}
    assert "$$SOE" in horizons.fetch(p, session=sess)
    assert sess.calls == 3
    sess2 = FakeSession([])
    assert "$$SOE" in horizons.fetch(p, session=sess2)  # served from cache
    assert sess2.calls == 0


def test_gives_up_and_does_not_cache_errors():
    sess = FakeSession([FakeResp(500, {})] * config.HORIZONS_RETRIES)
    with pytest.raises(horizons.HorizonsError):
        horizons.fetch({"b": 2}, session=sess)
    assert horizons.get_cache().get(horizons.get_cache().key({"b": 2})) is None


def test_api_error_field_raises_without_retry():
    sess = FakeSession([FakeResp(200, {"error": "bad SITE_COORD"})])
    with pytest.raises(horizons.HorizonsError, match="SITE_COORD"):
        horizons.fetch({"c": 3}, session=sess)
    assert sess.calls == 1


REAL = sorted((FIX / "real").glob("sun_*.json")) if (FIX / "real").exists() else []


@pytest.mark.skipif(not REAL, reason="run scripts/horizons_probe.py once to save a real fixture")
def test_real_fixture_parses():
    res = json.loads(REAL[0].read_text())["result"]
    s = horizons.azel_series(horizons.parse_table(res))
    assert len(s) >= 20 and all(-90 <= el <= 90 for _, _, el in s if el is not None)
