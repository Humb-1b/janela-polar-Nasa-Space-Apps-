# Janela Polar — Sun & Earth windows for lunar landing sites

**NASA Space Apps Challenge 2026** · Live app: **https://humb-1b.github.io/janela-polar-Nasa-Space-Apps-/**

Missions to the Moon's south pole live by two clocks: when the Sun is up (power, heat) and when Earth is
in view (direct-to-Earth radio, DTE). Near the pole the Sun skims the horizon at 1–2°, so a ridge 20 km away
decides everything, and Earth wobbles up and down with libration. Janela Polar ("Polar Window") lets mission
planners, teachers and the public compare landing sites side by side, see Sun and Earth against the real LOLA
horizon, find when both are available, and re-plan when a launch slips.

| Page | What it does |
|---|---|
| **Janela Polar** (`index.html`) | Map (south-polar / whole Moon), site panel with Sun & Earth elevation, sunset/earthset countdowns, return windows; horizon chart with LOLA terrain; timeline (Sun / DTE / Ideal / Return) with draggable cursor and animation; best-landing-date heatmap; sortable comparison; pinned scenarios; your own coordinates; 3 guided mission scenarios; CSV export. |
| **Earth to Moon** (`terra-lua.html`) | Kepler transfers (Hohmann ~5 d, fast 3 d) from a 185 km parking orbit, return to the 122 km entry interface, return windows with the Apollo daylight-recovery rule, launch sites (Earth-rotation boost, minimum inclination, moonrise). A launch delay updates the arrival date and opens Janela Polar on that site and date. |
| **NASA Data** (`dados-nasa.html`) | One card per data source, what it is and how the app uses it; per-site JPL Horizons tables and QuickMap / Moon Trek buttons; Canadian Space Agency section. |

English by default, Portuguese with one click (`?lang=pt`). Works on a 400 px phone, offline from disk, and on GitHub Pages.

## Guided mission scenarios (for judges)

1. **Launch Delay (+5 days at Malapert).** The app scans the loaded period for the landing day where a 5-day delay
   hurts Malapert most. Result with real geometry: from 24 Nov 2026 the Sun + DTE share of a 6.5-day stay drops
   from **97 % to 21 %**. Mons Mouton keeps *more Sun* (100 % vs 71 %) but *less Earth contact* (15 % vs 21 %):
   libration tips Earth toward or below the horizon of the whole south-polar region (sub-Earth latitude > 0 in
   early December), and the terrain toward Earth (~6° at the Mons Mouton grid centre vs ~3° at Malapert) decides
   who loses it first. Energy and communication point to different answers — a relay or another date is needed.
2. **3 km Spatial Contrast.** A ridge and a hollow 3.5 km apart in de Gerlache Rim 2 (LOLA terrain): over 30 days
   **92 % vs 36 % sunlight**, longest night **2 d vs ~19 d**, DTE **796 h vs 0 h**. (A second pair in Nobile Rim 2
   has a hollow that the model finds unlit all year.)
3. **Far Side Relay Need (Chang'e 6).** Normal lunar day/night (≈50 % sunlight) but **0 h** of DTE: Earth never rises.

## Quick start

```bash
pip install -r backend/requirements.txt pytest
cd backend && python -m app.api            # http://127.0.0.1:5000  (uses JPL Horizons, falls back to analytic)
python -m pytest -q && cd ..                # 70 offline tests (Horizons simulated)
node --test frontend/tests/*.test.mjs       # 15 JS tests (engine == Python, windows, orbits)
python scripts/horizons_probe.py            # real Horizons check (needs internet)
```
Or just open `frontend/index.html` in a browser: the analytic engine runs in the page.

## Architecture

```
backend/   Flask API (also serves the frontend)
  app/     horizons.py  JPL Horizons client: <=2 concurrent requests, disk cache, retries on 5xx, circuit breaker
           analytic.py  Meeus model (Moon ch.47, Sun ch.25, libration ch.53), topocentric with parallax
           ephemeris.py auto mode: Horizons, else analytic (flagged, not cached in memory)
           windows.py   horizon, disc fraction, Sun/DTE/ideal/return windows
           sites.py, api.py (/api/sites /api/bundle /api/point /api/windows[csv] /api/compare), cache.py, config.py
  data/    sites.json (single source of sites), horizon_masks/<id>.csv (LOLA)
  tests/   pytest, offline; real Horizons responses saved as fixtures
frontend/  plain HTML/CSS/JS, no build step
  js/engine.js   same maths as analytic.py + window rules (parity tests to 1e-7°)
  js/app.js, js/terra-lua.js, js/dados-nasa.js
  data/    sites_static.json (+ masks), bundle-YYYY-MM-DD-30d.json and validation.json (built by CI)
scripts/   horizons_probe.py, precompute.py, horizon_mask_from_dem.py, dem_io.py, sites_from_shapefiles.py,
           find_contrast_pair.py, validation_table.py, check_horizons_link.py, make_js_reference.py
.github/workflows/  tests.yml (all tests + live Horizons checks), pages.yml (daily Horizons bundle + Pages)
```
**Data source order in the browser** (shown in a badge): backend API with Horizons → precomputed Horizons bundle
(GitHub Actions, every push and daily at 04:17 UTC) → analytic engine in the page.

## Physics and rules

* **Ephemerides:** JPL Horizons OBSERVER tables, observer on the Moon (`CENTER='coord@301'`, geodetic site),
  `QUANTITIES='4'`, `APPARENT='AIRLESS'` (no refraction), hourly. DSN complexes: Moon elevation from Goldstone,
  Madrid, Canberra (`coord@399`).
* **Analytic fallback:** Meeus, *Astronomical Algorithms* 2nd ed.: full Tables 47.A/B (Moon), ch. 25 (Sun),
  ch. 53 optical libration with I = 1.54242°, topocentric positions on a 1737.4 km sphere including parallax;
  ΔT = 69.184 s. Physical libration and aberration are neglected.
* **Horizon:** effective horizon(az) = LOLA terrain mask(az) + margin − acos(R/(R+h)).
* **Energy:** fraction of the solar disc (radius 0.2666°) above the effective horizon; "Sun" = ≥ 50 %.
* **DTE:** Earth's centre above the effective horizon **and** the Moon ≥ 10° (adjustable) at ≥ 1 DSN complex.
* **Ideal window** = Sun and DTE; **return window** = ideal stretch ≥ 4/8/12/24 h, with latest start and next sunset.
* **Trajectories:** two-body Kepler ellipses with μ = 398600.4418 km³/s², aim point iterated to the Moon's position at
  arrival; fast transfer apogee by bisection; Kepler's equation solved by safeguarded Newton (converges to e = 0.999).
  Return windows: Sun ≥ 10° at the recovery zone at entry (Apollo daylight rule). Moon gravity and the Moon's ~5°
  orbital inclination are ignored (times good to a few hours).
* **Launch sites:** Earth-rotation boost = 465.1·cos(lat) m/s; minimum inclination = |lat|.

## Validation (Validity)

**Analytic model vs JPL Horizons** — `scripts/validation_table.py`, run in GitHub Actions on 2026-11-15 (live
Horizons queries, 24 hourly samples per cell, no terrain on either side; Δaz is multiplied by cos(el) to give an
on-sky angle and is only compared when the body is above −5°):

| Site | Date (UTC, 24 h) | Sun Δel max | Sun Δaz·cos(el) max | Earth Δel max | Earth Δaz·cos(el) max |
|---|---|---:|---:|---:|---:|
| Malapert Massif (Artemis III region centre) | 2026-11-15 | 0.023° | 0.011° | 0.031° | 0.014° |
| Malapert Massif | 2027-02-10 | 0.028° | 0.034° | 0.021° | 0.030° |
| Malapert Massif | 2027-06-01 | 0.013° | 0.030° | 0.010° | 0.024° |
| IM-2 Athena, Mons Mouton (NSSDC) | 2026-11-15 | 0.022° | 0.011° | 0.030° | 0.016° |
| IM-2 Athena, Mons Mouton | 2027-02-10 | 0.029° | 0.033° | 0.022° | 0.029° |
| IM-2 Athena, Mons Mouton | 2027-06-01 | 0.012° | — (Sun below −5°) | 0.011° | 0.023° |
| Apollo 11 LM (NSSDC) | 2026-11-15 | 0.009° | 0.023° | 0.012° | 0.032° |
| Apollo 11 LM | 2027-02-10 | 0.035° | — (night) | 0.027° | 0.025° |
| Apollo 11 LM | 2027-06-01 | 0.029° | — (night) | 0.021° | 0.014° |

Worst difference **0.035°** (tolerance 0.35°). The same comparison runs again on every Pages deployment
(`frontend/data/validation.json`). Also:
* sub-Earth and sub-solar selenographic points vs Horizons (QUANTITIES 14, 15): max 0.035°; Moon elevation from
  Goldstone: max 0.002° (`scripts/horizons_probe.py`, responses saved in `backend/tests/fixtures/real/` and
  re-checked offline by `test_validation_real.py`);
* Meeus worked examples 47.a, 25.a, 53.a reproduced to ~1e-5°;
* JS engine = Python to 1e-7° on ~300 cases; JS window rules = Python exactly;
* window rules (disc fraction vs numerical integration, horizon dip, mask interpolation, ±1 s interval edges),
  API incl. Horizons outage fallback, synthetic shapefile, synthetic DEM (a hill to the east blocks only the east),
  TIFF floating-point predictor decoder, orbit continuity and Kepler residual < 1e-12;
* the official Horizons table link shown in the app is fetched live by CI (`horizons-live` job).

## Data sources

* **JPL Horizons** — https://ssd.jpl.nasa.gov/horizons/ (API `https://ssd.jpl.nasa.gov/api/horizons.api`).
* **LOLA DEMs** — NASA PGDA product 90, `LDEM_80S_80MPP_ADJ` and `LDEM_60S_240MPP_ADJ`
  (Barker et al. 2023, *Planet. Sci. J.* 4, 183, doi:10.3847/PSJ/acf3e1) — https://pgda.gsfc.nasa.gov/products/90.
  Masks: rays every 1° to 150 km, angle = atan((z − z0 − d²/2R)/d), observer 2 m above the surface.
  Also referenced: PGDA products 78 (Barker et al. 2021) and 69 (polar illumination, Mazarico et al. 2011).
* **Artemis III candidate regions** — McClernan, M.T., 2024, *Down Selected Artemis III Candidate Landing Site
  Navigational Grids*, USGS data release, doi:10.5066/P1MEQ6UK (regions sourced from LROC QuickMap) —
  https://www.sciencebase.gov/catalog/item/671a6fa8d34efed5620f89f8. Region centre = mean of the 1 km grid cells,
  converted from the `.prj` projection (south polar stereographic, sphere 1737.4 km, false E/N 500 km, k0 0.994).
  8 of 9 regions loaded; **Mons Mouton Plateau pending** (its 4 quadrant files were not available to us).
* **Lander and Apollo positions** — NASA NSSDC, *Table of Anthropogenic Impacts and Spacecraft on the Moon*
  (page updated 2025-08-13, checked 2026-11-14) — https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html.
* **LROC QuickMap** — https://quickmap.lroc.asu.edu/ · **Moon Trek** — https://trek.nasa.gov/moon/.
* **Canadian Space Agency** — https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/canada-role/.
* J. Meeus, *Astronomical Algorithms*, 2nd ed., Willmann-Bell, 1998.
* DSN complex and launch-site coordinates come from the team brief (approximate); recovery zones are approximate.

## Known limitations

* QuickMap / Moon Trek: we could not confirm in a browser during the event how to open them centred on a coordinate;
  the buttons open the tool and copy the coordinate.
* Contrast pairs were picked from the LOLA DEM (highest point near the USGS region centre, lowest point 2.5–3.5 km
  away), not from a published illumination map; their illumination numbers are this app's model.
* Region centres are geometric centres of the USGS grids, not optimised landing points.
* Map shading in the browser uses a smooth sphere; site colours and all windows use LOLA terrain where available.

## AI assistance

All code, tests, scripts and texts in this repository (including this README and the in-app texts in English and
Portuguese) were generated with an AI assistant (Claude, by Anthropic) working from the team's written brief, during
the event. The team:
* ran `scripts/horizons_probe.py` against the real JPL Horizons API and supplied the responses used as fixtures;
* downloaded and supplied the USGS shapefiles and the LOLA DEMs;
* enabled GitHub Pages and tested the public site;
* reviewed the outputs and asked for checks — e.g. a team question about the charts led to finding and fixing a
  Kepler-solver divergence for the fast trajectories.

_Team: please complete this section in your own words (who reviewed what, how you checked the science)._
No AI-generated images are used. No NASA logos or insignia are used.

## License

MIT (see `LICENSE`). Data products belong to their providers (see Data sources).
