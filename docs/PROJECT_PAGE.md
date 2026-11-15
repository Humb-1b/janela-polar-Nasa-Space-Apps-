# Space Apps 2026 — project page draft (Janela Polar)

> Draft for the team to edit before submitting. Numbers come from the app and from the validation run of
> 2026-11-15; re-check them on the live site if you change the data.

## Project Summary (short)

Janela Polar ("Polar Window") is a free web tool that shows, for any lunar landing site and date, when the Sun is up
and when Earth is in view — using JPL Horizons ephemerides and real LOLA terrain. It compares Artemis III regions,
recent landers, Apollo sites and your own coordinates side by side, finds the best landing dates, and links a
launch delay directly to which site will be lit and in contact when you arrive.

## Project Description

**The problem.** At the lunar south pole the Sun never climbs more than 1–2° above the horizon, so a mountain
20 km away can decide whether a site has power for weeks or sits in darkness. Earth, needed for direct-to-Earth
(DTE) radio, also hangs low and rocks up and down with libration. Existing tools (QuickMap, Moon Trek, Horizons)
have the data, but comparing scenarios quickly is hard.

**What we built.**
* **Janela Polar** — map of the south pole and of the whole Moon; for each site, Sun and Earth elevation and
  azimuth, countdowns to sunset and earthset, the next "ideal" window (Sun + DTE), the longest night, DSN antennas
  in view, and return windows. A horizon chart draws the real LOLA skyline with the Sun and Earth paths; a timeline
  shows Sun / DTE / Ideal / Return bands with a draggable cursor and animation; a heatmap finds the best landing
  date for a mission length; tables compare sites and pinned scenarios; anyone can add a coordinate.
* **Earth to Moon** — Hohmann and 3-day transfers, return to entry interface with the Apollo daylight-recovery rule,
  launch sites. A launch delay moves the arrival date, and one click opens the surface view for that site and date.
* **NASA Data** — every source explained, with per-site links to the official Horizons tables.
* Three one-click **guided scenarios** for judges: a launch delay at Malapert, a 3 km ridge-vs-hollow contrast, and
  the far-side relay need of Chang'e 6.

**What it shows.** Two points 3.5 km apart in de Gerlache Rim 2 get 92 % vs 36 % sunlight over a month (longest
night 2 days vs 19 days). A 5-day launch delay from 24 Nov 2026 cuts Malapert's Sun-and-Earth time from 97 % to
21 % — and switching to Mons Mouton does not fix it: it keeps the Sun but loses Earth even sooner, because libration
drops Earth below the south-polar horizon in early December. Power and communication point to different answers.

**How it works.** Python/Flask backend calling the JPL Horizons API (airless, observer on the Moon), with a
validated analytic fallback (Meeus) that also runs in the browser; horizon masks ray-cast from LOLA DEMs out to
150 km; Artemis III region centres from the official USGS grids; plain HTML/JS frontend that works offline and on
GitHub Pages, refreshed daily with a Horizons bundle by GitHub Actions. English and Portuguese.

**Validation.** Against live JPL Horizons, 3 sites × 3 dates: worst difference 0.035° (tolerance 0.35°). 85
automated tests (Python and JavaScript) run on every push.

**Impact.** Mission planners can test dates and sites in seconds; teachers and the public can see *why* the south
pole is different, in two languages, on a phone.

## NASA Data

* **JPL Horizons API** — Sun and Earth azimuth/elevation from every site, Moon elevation from the DSN complexes;
  precomputed daily for the public site; reference for validation.
* **LRO LOLA digital elevation models** — NASA GSFC PGDA product 90 (`LDEM_80S_80MPP_ADJ`, `LDEM_60S_240MPP_ADJ`;
  Barker et al. 2023): terrain horizon masks for all south-polar sites and the 3 km contrast pairs.
* **Artemis III candidate landing regions** — USGS navigation grids (McClernan 2024, doi:10.5066/P1MEQ6UK),
  regions from **LROC QuickMap**.
* **NASA NSSDC** table of spacecraft on the Moon — positions of IM-1, IM-2, Chandrayaan-3, Blue Ghost 1, SLIM,
  Chang'e 4/6 and Apollo 11/15/17.
* **Moon Trek** and **LROC QuickMap** — linked per site for deeper exploration.
* Referenced: PGDA products 78 (site DEMs) and 69 (polar illumination).

## Space Agency Partner Data

* **Canadian Space Agency (CSA)** — Moon exploration portal (Canadarm3, lunar utility vehicle, LEAP, Jeremy Hansen
  on Artemis II), presented in the NASA Data page and connected to the app's question: where and when a surface
  rover near the south pole has Sun and Earth.

## Use of Artificial Intelligence

We used an AI assistant (Claude, by Anthropic) to write the code, tests, scripts and the English/Portuguese texts of
the app and documentation, following our written brief. The team ran the real JPL Horizons validation, supplied the
USGS and LOLA data files, deployed the site, tested it on desktop and phone, and reviewed the scientific results.
All AI-assisted work is listed in the README ("AI assistance"). No AI-generated images and no NASA logos are used.
