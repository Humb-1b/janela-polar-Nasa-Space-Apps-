# Janela Polar — NASA Space Apps Challenge 2026

Work in progress (stage 4 of 8). Full README with sources and the "AI assistance" section comes in stage 8.

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

## Terrain and official coordinates (stage 4)

* **Artemis III regions** — `scripts/sites_from_shapefiles.py` reads the USGS 1 km LGRS grid shapefiles
  (McClernan 2024, doi:10.5066/P1MEQ6UK). Their `.prj` is a south polar stereographic projection on the
  1737.4 km sphere with false easting/northing 500 km and scale factor 0.994 (USGS LPS), inverted in closed
  form (pyproj is used and cross-checked when installed). Region centre = mean of the grid cell centres.
  Check against the FGDC metadata: one axis of the metadata bounding box matches the grid exactly in every
  region and the centre lies inside it. 8 of 9 regions loaded; **Mons Mouton Plateau pending** (file not yet provided).
* **Horizon masks** — `scripts/horizon_mask_from_dem.py` casts rays every 1° to 150 km over the LOLA DEMs
  `LDEM_80S_80MPP_ADJ` (80 m) and `LDEM_60S_240MPP_ADJ` (240 m) from NASA PGDA product 90
  (Barker et al. 2023, doi:10.3847/PSJ/acf3e1); angle = atan((z − z0 − d²/2R)/d); observer 2 m above the surface.
  Masks for all sites south of 60°S are in `backend/data/horizon_masks/` and embedded in `frontend/data/sites_static.json`.
  Without rasterio the GeoTIFFs are read with tifffile + our own Deflate/floating-point-predictor decoder
  (`scripts/dem_io.py`); the 80 m and 240 m DEMs agree within ~4 m at the test points.
* **3 km contrast pairs** — `scripts/find_contrast_pair.py`: highest DEM point near the USGS region centre and the
  lowest point 2.5–3.5 km away (de Gerlache Rim 2 and Nobile Rim 2). Chosen from the DEM, not from a published
  illumination map; illumination numbers are this app's model.
