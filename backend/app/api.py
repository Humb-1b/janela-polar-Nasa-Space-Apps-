"""Flask API + static frontend.

Run:  cd backend && python -m app.api        (http://127.0.0.1:5000)

Common query parameters (all optional):
  start=YYYY-MM-DD (UTC, default today)   days=1..90 (default 30)
  mode=auto|horizons|analytic (default auto)
  margin=deg (default 0)   height=m above ground (default 0)
  dsn_min=deg (default 10) return_hours=4|8|12|24 (default 8)
"""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone

from flask import Flask, jsonify, request, Response, send_from_directory

from . import config, ephemeris, sites, windows
from .horizons import HorizonsError

FRONTEND = config.BASE_DIR.parent / "frontend"
RETURN_HOURS = (4, 8, 12, 24)


def _iso(t):
    return t.strftime("%Y-%m-%dT%H:%MZ") if isinstance(t, datetime) else t


def _jsonable(x):
    if isinstance(x, datetime):
        return _iso(x)
    if isinstance(x, dict):
        return {k: _jsonable(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_jsonable(v) for v in x]
    if isinstance(x, float):
        return round(x, 4)
    return x


def _f(name, default, lo, hi):
    raw = request.args.get(name)
    if raw in (None, ""):
        return default
    try:
        v = float(raw)
    except ValueError:
        raise ValueError(f"{name} must be a number")
    if not lo <= v <= hi:
        raise ValueError(f"{name} must be in [{lo}, {hi}]")
    return v


def params():
    s = request.args.get("start")
    if s:
        try:
            start = datetime.strptime(s, "%Y-%m-%d")
        except ValueError:
            raise ValueError("start must be YYYY-MM-DD")
    else:
        now = datetime.now(timezone.utc)
        start = datetime(now.year, now.month, now.day)
    rh = _f("return_hours", 8, 1, 24)
    if rh not in RETURN_HOURS:
        raise ValueError(f"return_hours must be one of {RETURN_HOURS}")
    mode = request.args.get("mode", "auto")
    if mode not in ("auto", "horizons", "analytic"):
        raise ValueError("mode must be auto, horizons or analytic")
    return {"start": start, "days": int(_f("days", 30, 1, 90)), "mode": mode,
            "margin": _f("margin", 0.0, -5, 15), "height": _f("height", 0.0, 0, 1000),
            "dsn_min": _f("dsn_min", config.DSN_MIN_ELEV_DEG, 0, 45), "return_hours": rh}


def compute(lat, lon, p, mask=None):
    ser = ephemeris.site_series(lat, lon, p["start"], p["days"], p["mode"])
    ev = windows.evaluate(ser, mask, p["margin"], p["height"], p["dsn_min"])
    summ = windows.summarize(ser, ev, p["return_hours"])
    return ser, ev, summ


def _meta(p, sources, errors=()):
    return {"start": p["start"].strftime("%Y-%m-%d"), "days": p["days"], "step_min": 60,
            "mode": p["mode"], "sources": sorted(set(sources)), "horizons_errors": list(errors)[:3],
            "params": {k: p[k] for k in ("margin", "height", "dsn_min", "return_hours")},
            "generated_utc": _iso(datetime.now(timezone.utc).replace(tzinfo=None))}


def _series_out(ser, ev=None):
    d = {k: ser[k] for k in ("sun_az", "sun_el", "earth_az", "earth_el")}
    if ev is not None:
        d.update({"sun_frac": ev["sun_frac"], "hz_sun": ev["hz_sun"], "hz_earth": ev["hz_earth"]})
    return d


def create_app():
    app = Flask(__name__, static_folder=None)

    @app.errorhandler(ValueError)
    def bad(e):
        return jsonify(error=str(e)), 400

    @app.errorhandler(sites.UnknownSite)
    def missing(e):
        return jsonify(error=str(e.args[0] if e.args else e)), 404

    @app.errorhandler(HorizonsError)
    def upstream(e):
        return jsonify(error=f"JPL Horizons: {e}"), 502

    @app.get("/api/health")
    def health():
        return jsonify(ok=True)

    @app.get("/api/sites")
    def api_sites():
        return jsonify(sites=[sites.public(s) for s in sites.all_sites()])

    @app.get("/api/bundle")
    def api_bundle():
        """Raw series for every computable site (+ DSN + masks): the frontend
        evaluates the windows itself, so sliders don't need new requests."""
        p = params()
        sel = sites.select(request.args.get("set", "all"))
        out, srcs, errs, dsn, times = [], [], [], None, None
        for s in sel:
            ser = ephemeris.site_series(s["lat"], s["lon"], p["start"], p["days"], p["mode"])
            srcs.append(ser["source"])
            if ser["error"]:
                errs.append(ser["error"])
            dsn, times = dsn or ser["dsn"], times or ser["times"]
            out.append({**sites.public(s), "source": ser["source"], "horizon_mask": sites.load_mask(s["id"]),
                        "series": _series_out(ser)})
        return jsonify(_jsonable({"meta": _meta(p, srcs, errs), "times": times or [], "dsn": dsn or {},
                                  "sites": out}))

    @app.get("/api/point")
    def api_point():
        p = params()
        try:
            lat, lon = float(request.args["lat"]), float(request.args["lon"])
        except (KeyError, ValueError):
            raise ValueError("lat and lon are required numbers")
        lat, lon = sites.validate_point(lat, lon)
        ser, ev, summ = compute(lat, lon, p)
        return jsonify(_jsonable({"meta": _meta(p, [ser["source"]], [ser["error"]] if ser["error"] else []),
                                  "point": {"lat": lat, "lon": lon, "has_horizon_mask": False},
                                  "times": ser["times"], "dsn": ser["dsn"], "series": _series_out(ser, ev),
                                  "flags": {k: ev[k] for k in ("sun", "dte", "ideal")}, "summary": summ}))

    @app.get("/api/windows")
    def api_windows():
        p = params()
        s = sites.get(request.args.get("site", ""))
        if not sites.has_coords(s):
            raise ValueError(f"site '{s['id']}' has no verified coordinates yet")
        ser, ev, summ = compute(s["lat"], s["lon"], p, sites.load_mask(s["id"]))
        if request.args.get("format") == "csv":
            buf = io.StringIO()
            w = csv.writer(buf)
            w.writerow(["site", "type", "start_utc", "end_utc", "hours", "source"])
            for kind in ("sun", "dte", "ideal"):
                for a, b in summ["intervals"][kind]:
                    w.writerow([s["id"], kind, _iso(a), _iso(b), f"{(b - a).total_seconds() / 3600:.1f}", ser["source"]])
            for r in summ["return_windows"]:
                w.writerow([s["id"], f"return_{int(p['return_hours'])}h", _iso(r["start"]), _iso(r["latest_start"]),
                            f"{r['hours']:.1f}", ser["source"]])
            fn = f"janela-polar_{s['id']}_{p['start']:%Y-%m-%d}_{p['days']}d.csv"
            return Response(buf.getvalue(), mimetype="text/csv",
                            headers={"Content-Disposition": f"attachment; filename={fn}"})
        return jsonify(_jsonable({"meta": _meta(p, [ser["source"]], [ser["error"]] if ser["error"] else []),
                                  "site": sites.public(s), "summary": summ}))

    @app.get("/api/compare")
    def api_compare():
        p = params()
        ids = [i for i in request.args.get("sites", "").split(",") if i]
        if not ids:
            raise ValueError("sites=id1,id2,... is required")
        rows, srcs = [], []
        for s in sites.select(ids=ids, computable_only=False):
            if not sites.has_coords(s):
                rows.append({"id": s["id"], "name": s["name"], "error": "no verified coordinates yet"})
                continue
            ser, ev, summ = compute(s["lat"], s["lon"], p, sites.load_mask(s["id"]))
            srcs.append(ser["source"])
            rows.append({"id": s["id"], "name": s["name"], "source": ser["source"],
                         **{k: summ[k] for k in ("sun_pct", "dte_pct", "ideal_pct", "sun_hours", "dte_hours",
                                                 "ideal_hours", "longest_night_hours", "longest_no_dte_hours",
                                                 "status", "next_ideal")},
                         "return_windows": len(summ["return_windows"])})
        return jsonify(_jsonable({"meta": _meta(p, srcs), "rows": rows}))

    @app.get("/")
    def index():
        return send_from_directory(FRONTEND, "index.html")

    @app.get("/<path:path>")
    def static_files(path):
        return send_from_directory(FRONTEND, path)

    return app


if __name__ == "__main__":
    create_app().run(debug=True)
