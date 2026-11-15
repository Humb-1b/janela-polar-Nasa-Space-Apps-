"""API tests, no internet: Horizons is simulated."""
import csv
import io

import pytest

from app import api, config, ephemeris, horizons, sites


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CACHE_DIR", tmp_path)
    monkeypatch.setattr(horizons, "_cache", None)
    ephemeris.clear_memory_cache()
    return api.create_app().test_client()


@pytest.fixture()
def horizons_down(monkeypatch):
    calls = {"n": 0}

    def boom(*a, **k):
        calls["n"] += 1
        raise horizons.HorizonsError("simulated outage")
    monkeypatch.setattr(horizons, "fetch", boom)
    return calls


Q = "start=2026-11-15&days=3"


def test_sites_lists_all_and_flags_pending(client):
    r = client.get("/api/sites").get_json()["sites"]
    ids = {s["id"]: s for s in r}
    assert len(r) == 19
    assert ids["im2"]["lat"] == -84.7906 and ids["im2"]["has_coords"]
    a3 = [s for s in r if s["set"] == "artemis3"]
    assert len(a3) == 9 and all(not s["has_coords"] and s["coord_status"] == "pending_usgs" for s in a3)


def test_auto_falls_back_and_is_not_memory_cached(client, horizons_down):
    j = client.get(f"/api/windows?site=im1&{Q}").get_json()
    assert j["meta"]["sources"] == ["analytic-fallback"]
    assert "simulated outage" in j["meta"]["horizons_errors"][0]
    n1 = horizons_down["n"]
    client.get(f"/api/windows?site=im1&{Q}")
    assert horizons_down["n"] > n1  # tried Horizons again: fallback not cached


def test_horizons_mode_reports_502(client, horizons_down):
    assert client.get(f"/api/windows?site=im1&{Q}&mode=horizons").status_code == 502


def test_auto_uses_horizons_when_up(client, monkeypatch):
    """Simulated Horizons answering with the analytic numbers, in its CSV layout."""
    from app import analytic

    def fake_fetch(params, **k):
        lat_lon = params["SITE_COORD"].strip("'").split(",")
        lon, lat = float(lat_lon[0]), float(lat_lon[1])
        lon = lon - 360 if lon > 180 else lon
        from datetime import datetime, timedelta
        t0 = datetime.strptime(params["START_TIME"].strip("'"), "%Y-%m-%d %H:%M")
        t1 = datetime.strptime(params["STOP_TIME"].strip("'"), "%Y-%m-%d %H:%M")
        lines = [" Date__(UT)__HR:MN, , , Azi_(a-app), Elev_(a-app),", "$$SOE"]
        t = t0
        while t <= t1:
            if params["CENTER"] == "'coord@301'":
                body = "sun" if params["COMMAND"] == "'10'" else "earth"
                az, el, _ = analytic.sun_earth_altaz_on_moon(t, lat, lon)[body]
            else:
                az, el, _ = analytic.moon_altaz_from_earth(t, lat, lon)
            lines.append(f" {t:%Y-%b-%d %H:%M}, , , {az:.6f}, {el:.6f},")
            t += timedelta(hours=1)
        lines.append("$$EOE")
        return "\n".join(lines)
    monkeypatch.setattr(horizons, "fetch", fake_fetch)
    j = client.get(f"/api/windows?site=im2&{Q}").get_json()
    assert j["meta"]["sources"] == ["horizons"]
    a = client.get(f"/api/windows?site=im2&{Q}&mode=analytic").get_json()
    assert j["summary"]["sun_hours"] == a["summary"]["sun_hours"]


def test_windows_csv(client, horizons_down):
    r = client.get(f"/api/windows?site=a11&start=2026-11-15&days=30&format=csv")
    assert r.status_code == 200 and r.mimetype == "text/csv"
    rows = list(csv.reader(io.StringIO(r.get_data(as_text=True))))
    assert rows[0] == ["site", "type", "start_utc", "end_utc", "hours", "source"]
    kinds = {row[1] for row in rows[1:]}
    assert {"sun", "dte", "ideal"} <= kinds
    assert "attachment" in r.headers["Content-Disposition"]


def test_equatorial_site_has_about_half_sunlight(client, horizons_down):
    s = client.get("/api/windows?site=a11&start=2026-11-15&days=59&mode=analytic").get_json()["summary"]
    assert 45 < s["sun_pct"] < 55          # two synodic months
    assert 300 < s["longest_night_hours"] < 380   # ~14.8 days


def test_far_side_has_no_dte(client):
    s = client.get("/api/windows?site=ce6&start=2026-11-15&days=30&mode=analytic").get_json()["summary"]
    assert s["dte_hours"] == 0 and s["sun_hours"] > 0 and s["ideal_hours"] == 0


def test_point_and_validation(client):
    j = client.get(f"/api/point?lat=-89.9&lon=0&{Q}&mode=analytic").get_json()
    assert j["point"]["lat"] == -89.9 and len(j["times"]) == 72
    assert len(j["series"]["sun_frac"]) == 72
    assert client.get(f"/api/point?lat=-95&lon=0&{Q}").status_code == 400
    assert client.get(f"/api/point?lon=0&{Q}").status_code == 400
    assert client.get(f"/api/point?lat=0&lon=0&days=200").status_code == 400
    assert client.get(f"/api/point?lat=0&lon=0&start=15/11/2026").status_code == 400
    assert client.get(f"/api/windows?site=a11&return_hours=5").status_code == 400


def test_unknown_and_pending_sites(client):
    assert client.get(f"/api/windows?site=nope&{Q}").status_code == 404
    assert client.get(f"/api/windows?site=a3-haworth&{Q}&mode=analytic").status_code == 400


def test_compare(client):
    j = client.get(f"/api/compare?sites=im1,ce6,a3-haworth&{Q}&mode=analytic").get_json()
    rows = {r["id"]: r for r in j["rows"]}
    assert rows["ce6"]["dte_pct"] == 0
    assert "error" in rows["a3-haworth"]
    assert client.get(f"/api/compare?{Q}").status_code == 400


def test_bundle_has_series_dsn_and_masks(client, monkeypatch, tmp_path):
    mdir = tmp_path / "data" / "horizon_masks"
    mdir.mkdir(parents=True)
    (tmp_path / "data" / "sites.json").write_text((config.DATA_DIR / "sites.json").read_text())
    (mdir / "im1.csv").write_text("azimuth_deg,horizon_deg\n" + "".join(f"{a},{a / 360:.3f}\n" for a in range(360)))
    monkeypatch.setattr(config, "DATA_DIR", tmp_path / "data")
    sites.reload()
    try:
        j = client.get(f"/api/bundle?{Q}&mode=analytic&set=landers").get_json()
    finally:
        sites.reload()
    assert len(j["times"]) == 72 and set(j["dsn"]) == {"goldstone", "madrid", "canberra"}
    by = {s["id"]: s for s in j["sites"]}
    assert len(by) == 7 and by["im1"]["has_horizon_mask"] and len(by["im1"]["horizon_mask"]) == 360
    assert by["ch3"]["horizon_mask"] is None
    assert len(by["ce4"]["series"]["sun_el"]) == 72


def test_static_sites_in_sync_with_sites_json():
    """frontend/data/sites_static.json must be regenerated when sites.json changes."""
    import importlib.util
    import json
    root = config.BASE_DIR.parent
    spec = importlib.util.spec_from_file_location("pre", root / "scripts" / "precompute.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    fresh = json.loads(json.dumps(mod.static_sites(), ensure_ascii=False))
    stored = json.loads((root / "frontend" / "data" / "sites_static.json").read_text(encoding="utf-8"))
    assert fresh == stored, "run: python scripts/precompute.py --sites-only"
    js = (root / "frontend" / "js" / "sites_static.js").read_text(encoding="utf-8")
    assert json.loads(js.split("=", 1)[1].strip().rstrip(";")) == stored
