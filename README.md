# Janela Polar — NASA Space Apps Challenge 2026

Work in progress (stage 3 of 8). Full README with sources and the "AI assistance" section comes in stage 8.

Run tests:
```
pip install -r backend/requirements.txt pytest
cd backend && python -m pytest -q && cd ..
node --test frontend/tests/*.test.mjs
python scripts/horizons_probe.py        # needs internet: real JPL Horizons check
```

## Backend API (stage 2)

```
pip install -r backend/requirements.txt
cd backend && python -m app.api          # http://127.0.0.1:5000
```

| Route | What it returns |
|---|---|
| `/api/sites` | all sites from `backend/data/sites.json` (+ coordinate status, mask availability) |
| `/api/bundle?start=&days=&set=` | raw Sun/Earth az-el series for every site, DSN Moon elevations, horizon masks |
| `/api/point?lat=&lon=` | series + windows for a user coordinate |
| `/api/windows?site=&format=json\|csv` | Sun / DTE / ideal intervals, return windows, summary |
| `/api/compare?sites=a,b,c` | summary table for several sites |

Common parameters: `start=YYYY-MM-DD` (UTC), `days` (1–90), `mode=auto|horizons|analytic`,
`margin` (deg), `height` (m), `dsn_min` (deg, default 10), `return_hours` (4/8/12/24).
In `auto` mode the backend calls JPL Horizons and, if it fails, falls back to the analytic
model; the response then says `analytic-fallback` and the result is not kept in memory.

Coordinates: landers and Apollo LMs are from the NASA NSSDC table (checked 2026-11-14).
The 9 Artemis III regions are listed but have **no coordinates yet** — they will come from the
USGS navigation grids (McClernan 2024, doi:10.5066/P1MEQ6UK) in stage 4.

## Janela Polar page (stage 3)

Open `frontend/index.html` directly (analytic engine in the browser) or through the backend
(`cd backend && python -m app.api`, then http://127.0.0.1:5000) to use JPL Horizons.
Data source order, shown in the badge: backend API → precomputed bundle (`frontend/data/`) → browser engine.
URL parameters: `?site=<id>&start=YYYY-MM-DD&days=<n>&lang=en|pt`.
After editing `backend/data/sites.json` run `python scripts/precompute.py --sites-only`.
