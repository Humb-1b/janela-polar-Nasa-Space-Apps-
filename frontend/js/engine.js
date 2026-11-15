/* Janela Polar - analytic engine (browser + Node).
 * Line-by-line port of backend/app/analytic.py; frontend/tests/engine.test.mjs
 * checks that both give the same numbers (to 1e-7 deg).
 * Meeus, Astronomical Algorithms 2nd ed.: ch. 12, 22, 25, 47, 53 (I = 1.54242 deg).
 * Validated against JPL Horizons by scripts/horizons_probe.py (max 0.035 deg).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JPEngine = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const DELTA_T_S = 69.184, MOON_RADIUS_KM = 1737.4, AU_KM = 149597870.7;
  const EARTH_EQ_RADIUS_KM = 6378.137, EARTH_FLATTENING = 1 / 298.257223563;
  const I_MOON = 1.54242, D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const sin = (x) => Math.sin(x * D2R), cos = (x) => Math.cos(x * D2R);
  const norm360 = (x) => ((x % 360) + 360) % 360;
  const norm180 = (x) => norm360(x + 180) - 180;

  // ---- time (accepts Date or ms since epoch, UTC)
  const julianDay = (t) => (t instanceof Date ? t.getTime() : t) / 86400000 + 2440587.5;
  const jdTT = (t) => julianDay(t) + DELTA_T_S / 86400;
  const centuries = (jd) => (jd - 2451545.0) / 36525;

  // ---- Moon, ch. 47 (D, M, M', F, sum_l, sum_r) / (D, M, M', F, sum_b)
  const T47A = [
    [0,0,1,0,6288774,-20905355],[2,0,-1,0,1274027,-3699111],[2,0,0,0,658314,-2955968],
    [0,0,2,0,213618,-569925],[0,1,0,0,-185116,48888],[0,0,0,2,-114332,-3149],
    [2,0,-2,0,58793,246158],[2,-1,-1,0,57066,-152138],[2,0,1,0,53322,-170733],
    [2,-1,0,0,45758,-204586],[0,1,-1,0,-40923,-129620],[1,0,0,0,-34720,108743],
    [0,1,1,0,-30383,104755],[2,0,0,-2,15327,10321],[0,0,1,2,-12528,0],
    [0,0,1,-2,10980,79661],[4,0,-1,0,10675,-34782],[0,0,3,0,10034,-23210],
    [4,0,-2,0,8548,-21636],[2,1,-1,0,-7888,24208],[2,1,0,0,-6766,30824],
    [1,0,-1,0,-5163,-8379],[1,1,0,0,4987,-16675],[2,-1,1,0,4036,-12831],
    [2,0,2,0,3994,-10445],[4,0,0,0,3861,-11650],[2,0,-3,0,3665,14403],
    [0,1,-2,0,-2689,-7003],[2,0,-1,2,-2602,0],[2,-1,-2,0,2390,10056],
    [1,0,1,0,-2348,6322],[2,-2,0,0,2236,-9884],[0,1,2,0,-2120,5751],
    [0,2,0,0,-2069,0],[2,-2,-1,0,2048,-4950],[2,0,1,-2,-1773,4130],
    [2,0,0,2,-1595,0],[4,-1,-1,0,1215,-3958],[0,0,2,2,-1110,0],
    [3,0,-1,0,-892,3258],[2,1,1,0,-810,2616],[4,-1,-2,0,759,-1897],
    [0,2,-1,0,-713,-2117],[2,2,-1,0,-700,2354],[2,1,-2,0,691,0],
    [2,-1,0,-2,596,0],[4,0,1,0,549,-1423],[0,0,4,0,537,-1117],
    [4,-1,0,0,520,-1571],[1,0,-2,0,-487,-1739],[2,1,0,-2,-399,0],
    [0,0,2,-2,-381,-4421],[1,1,1,0,351,0],[3,0,-2,0,-340,0],
    [4,0,-3,0,330,0],[2,-1,2,0,327,0],[0,2,1,0,-323,1165],
    [1,1,-1,0,299,0],[2,0,3,0,294,0],[2,0,-1,-2,0,8752],
  ];
  const T47B = [
    [0,0,0,1,5128122],[0,0,1,1,280602],[0,0,1,-1,277693],[2,0,0,-1,173237],
    [2,0,-1,1,55413],[2,0,-1,-1,46271],[2,0,0,1,32573],[0,0,2,1,17198],
    [2,0,1,-1,9266],[0,0,2,-1,8822],[2,-1,0,-1,8216],[2,0,-2,-1,4324],
    [2,0,1,1,4200],[2,1,0,-1,-3359],[2,-1,-1,1,2463],[2,-1,0,1,2211],
    [2,-1,-1,-1,2065],[0,1,-1,-1,-1870],[4,0,-1,-1,1828],[0,1,0,1,-1794],
    [0,0,0,3,-1749],[0,1,-1,1,-1565],[1,0,0,1,-1491],[0,1,1,1,-1475],
    [0,1,1,-1,-1410],[0,1,0,-1,-1344],[1,0,0,-1,-1335],[0,0,3,1,1107],
    [4,0,0,-1,1021],[4,0,-1,1,833],[0,0,1,-3,777],[4,0,-2,1,671],
    [2,0,0,-3,607],[2,0,2,-1,596],[2,-1,1,-1,491],[2,0,-2,1,-451],
    [0,0,3,-1,439],[2,0,2,1,422],[2,0,-3,-1,421],[2,1,-1,1,-366],
    [2,1,0,1,-351],[4,0,0,1,331],[2,-1,1,1,315],[2,-2,0,-1,302],
    [0,0,1,3,-283],[2,1,1,-1,-229],[1,1,0,-1,223],[1,1,0,1,223],
    [0,1,-2,-1,-220],[2,1,-1,-1,-220],[1,0,1,1,-185],[2,-1,-2,-1,181],
    [0,1,2,1,-177],[4,0,-2,-1,176],[4,-1,-1,-1,166],[1,0,1,-1,-164],
    [4,0,1,-1,132],[1,0,-1,-1,-119],[4,-1,0,-1,115],[2,-2,0,1,107],
  ];

  function moonFundamental(T) {
    const T2 = T * T, T3 = T2 * T, T4 = T3 * T;
    return {
      Lp: norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000),
      D: norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000),
      M: norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000),
      Mp: norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000),
      F: norm360(93.2720950 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000),
      Omega: norm360(125.0445479 - 1934.1362891 * T + 0.0020754 * T2 + T3 / 467441 - T4 / 60616000),
      E: 1 - 0.002516 * T - 0.0000074 * T2,
      A1: norm360(119.75 + 131.849 * T),
      A2: norm360(53.09 + 479264.290 * T),
      A3: norm360(313.45 + 481266.484 * T),
    };
  }

  function moonGeocentric(jde) {
    const f = moonFundamental(centuries(jde));
    const { D, M, Mp, F, E } = f;
    let sl = 0, sr = 0, sb = 0;
    for (const [d, m, mp, ff, cl, cr] of T47A) {
      const e = E ** Math.abs(m), arg = d * D + m * M + mp * Mp + ff * F;
      sl += cl * e * sin(arg);
      sr += cr * e * cos(arg);
    }
    for (const [d, m, mp, ff, cb] of T47B) sb += cb * E ** Math.abs(m) * sin(d * D + m * M + mp * Mp + ff * F);
    const { Lp, A1, A2, A3 } = f;
    sl += 3958 * sin(A1) + 1962 * sin(Lp - F) + 318 * sin(A2);
    sb += -2235 * sin(Lp) + 382 * sin(A3) + 175 * sin(A1 - F) + 175 * sin(A1 + F) + 127 * sin(Lp - Mp) - 115 * sin(Lp + Mp);
    return [norm360(Lp + sl / 1e6), sb / 1e6, 385000.56 + sr / 1000];
  }

  // ---- Sun, ch. 25
  function sunGeocentric(jde) {
    const T = centuries(jde);
    const L0 = norm360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
    const M = norm360(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
    const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
    const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M) + (0.019993 - 0.000101 * T) * sin(2 * M) + 0.000289 * sin(3 * M);
    const Rau = 1.000001018 * (1 - e * e) / (1 + e * cos(M + C));
    return [norm360(L0 + C), 0, Rau * AU_KM];
  }

  const sph2vec = (lon, lat, r = 1) => [r * cos(lat) * cos(lon), r * cos(lat) * sin(lon), r * sin(lat)];
  function vec2sph([x, y, z]) {
    const r = Math.hypot(x, y, z);
    return [norm360(Math.atan2(y, x) * R2D), Math.asin(z / r) * R2D, r];
  }

  // ---- ch. 53: direction body->Moon (ecliptic of date) -> sub-body selenographic point
  function selenographicSubpoint(lam, beta, Omega, F) {
    const W = lam - Omega;
    const A = Math.atan2(sin(W) * cos(beta) * cos(I_MOON) - sin(beta) * sin(I_MOON), cos(W) * cos(beta)) * R2D;
    const lat = Math.asin(-sin(W) * cos(beta) * sin(I_MOON) - sin(beta) * cos(I_MOON)) * R2D;
    return [norm180(A - F), lat];
  }

  function moonState(t) {
    const jde = jdTT(t), f = moonFundamental(centuries(jde));
    const [lm, bm, dm] = moonGeocentric(jde), [ls, , ds] = sunGeocentric(jde);
    const m = sph2vec(lm, bm, dm), s = sph2vec(ls, 0, ds);
    const [lh, bh, dh] = vec2sph([m[0] - s[0], m[1] - s[1], m[2] - s[2]]);
    const [eLon, eLat] = selenographicSubpoint(lm, bm, f.Omega, f.F);
    const [sLon, sLat] = selenographicSubpoint(lh, bh, f.Omega, f.F);
    return { subearth_lon: eLon, subearth_lat: eLat, earth_dist_km: dm,
             subsolar_lon: sLon, subsolar_lat: sLat, sun_dist_km: dh,
             moon_lambda: lm, moon_beta: bm, sun_lambda: ls };
  }

  function enuAltaz(target, site, lat, lon) {
    const v = [target[0] - site[0], target[1] - site[1], target[2] - site[2]];
    const e = [-sin(lon), cos(lon), 0];
    const n = [-sin(lat) * cos(lon), -sin(lat) * sin(lon), cos(lat)];
    const u = [cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat)];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const ve = dot(v, e), vn = dot(v, n), vu = dot(v, u);
    return [norm360(Math.atan2(ve, vn) * R2D), Math.atan2(vu, Math.hypot(ve, vn)) * R2D, Math.hypot(ve, vn, vu)];
  }

  /** Airless topocentric az/el of Sun and Earth at a lunar point (spherical Moon, parallax included). */
  function sunEarthAltazOnMoon(t, lat, lonEast, altKm = 0) {
    const st = moonState(t);
    const site = sph2vec(lonEast, lat, MOON_RADIUS_KM + altKm);
    return {
      sun: enuAltaz(sph2vec(st.subsolar_lon, st.subsolar_lat, st.sun_dist_km), site, lat, lonEast),
      earth: enuAltaz(sph2vec(st.subearth_lon, st.subearth_lat, st.earth_dist_km), site, lat, lonEast),
      state: st,
    };
  }

  function gmstDeg(t) {
    const jd = julianDay(t), T = centuries(jd);
    return norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - T ** 3 / 38710000);
  }

  function meanObliquity(jde) {
    const T = centuries(jde);
    return 23 + 26 / 60 + (21.448 - 46.815 * T - 0.00059 * T * T + 0.001813 * T ** 3) / 3600;
  }

  /** Topocentric az/el of the Moon from an Earth site (e.g. a DSN complex), no refraction. */
  function moonAltazFromEarth(t, lat, lonEast, altKm = 0) {
    const jde = jdTT(t), [lm, bm, dm] = moonGeocentric(jde), eps = meanObliquity(jde);
    const [x, y, z] = sph2vec(lm, bm, dm);
    const ye = y * cos(eps) - z * sin(eps), ze = y * sin(eps) + z * cos(eps);
    const g = gmstDeg(t);
    const xf = x * cos(g) + ye * sin(g), yf = -x * sin(g) + ye * cos(g);
    const a = EARTH_EQ_RADIUS_KM, e2 = EARTH_FLATTENING * (2 - EARTH_FLATTENING);
    const N = a / Math.sqrt(1 - e2 * sin(lat) ** 2);
    const site = [(N + altKm) * cos(lat) * cos(lonEast), (N + altKm) * cos(lat) * sin(lonEast), (N * (1 - e2) + altKm) * sin(lat)];
    return enuAltaz([xf, yf, ze], site, lat, lonEast);
  }

  /** Same as sunEarthAltazOnMoon but reusing a precomputed moonState (fast batch). */
  function altazFromState(st, lat, lonEast, altKm = 0) {
    const site = sph2vec(lonEast, lat, MOON_RADIUS_KM + altKm);
    return {
      sun: enuAltaz(sph2vec(st.subsolar_lon, st.subsolar_lat, st.sun_dist_km), site, lat, lonEast),
      earth: enuAltaz(sph2vec(st.subearth_lon, st.subearth_lat, st.earth_dist_km), site, lat, lonEast),
    };
  }

  // ---- DSN complexes (lat, lon east) - backend/app/config.py
  const DSN_SITES = { goldstone: [35.4267, -116.89], madrid: [40.4314, -4.2481], canberra: [-35.4014, 148.9817] };

  /** Analytic bundle with the same shape as /api/bundle. points: [{id, lat, lon}] */
  function analyticBundle(points, startMs, days, stepMin = 60) {
    const n = Math.round(days * 24 * 60 / stepMin), times = [], states = [];
    for (let i = 0; i < n; i++) { const t = startMs + i * stepMin * 60000; times.push(t); states.push(moonState(t)); }
    const dsn = {};
    for (const [k, [la, lo]] of Object.entries(DSN_SITES)) dsn[k] = times.map((t) => moonAltazFromEarth(t, la, lo)[1]);
    const sites = points.map((p) => {
      const s = { sun_az: [], sun_el: [], earth_az: [], earth_el: [] };
      for (const st of states) {
        const r = altazFromState(st, p.lat, p.lon);
        s.sun_az.push(r.sun[0]); s.sun_el.push(r.sun[1]); s.earth_az.push(r.earth[0]); s.earth_el.push(r.earth[1]);
      }
      return { id: p.id, series: s };
    });
    return { times, dsn, sites, states };
  }

  // ---- window rules: line-by-line port of backend/app/windows.py
  const SUN_RADIUS_DEG = 0.2666, HOUR = 3600000;
  function depressionDeg(heightM, radiusKm = MOON_RADIUS_KM) {
    if (heightM <= 0) return 0;
    const R = radiusKm * 1000;
    return Math.acos(R / (R + heightM)) * R2D;
  }
  function maskAt(mask, az) {
    if (!mask || !mask.length) return 0;
    const n = mask.length, x = (((az % 360) + 360) % 360) * n / 360;
    const i = Math.floor(x) % n, f = x - Math.floor(x);
    return mask[i] * (1 - f) + mask[(i + 1) % n] * f;
  }
  const effectiveHorizon = (az, mask, marginDeg = 0, heightM = 0) => maskAt(mask, az) + marginDeg - depressionDeg(heightM);
  function discFraction(el, horizon, radius = SUN_RADIUS_DEG) {
    const d = el - horizon;
    if (d >= radius) return 1;
    if (d <= -radius) return 0;
    const r = radius, below = r * r * Math.acos(d / r) - d * Math.sqrt(r * r - d * d);
    return 1 - below / (Math.PI * r * r);
  }
  function evaluate(series, dsn, mask = null, marginDeg = 0, heightM = 0, dsnMinEl = 10) {
    const n = series.sun_el.length, keys = Object.keys(dsn);
    const out = { sun_frac: [], sun: [], earth_up: [], dsn_any: [], dte: [], ideal: [], hz_sun: [], hz_earth: [], dsn_active: [] };
    for (let i = 0; i < n; i++) {
      const hs = effectiveHorizon(series.sun_az[i], mask, marginDeg, heightM);
      const he = effectiveHorizon(series.earth_az[i], mask, marginDeg, heightM);
      const frac = discFraction(series.sun_el[i], hs);
      const active = keys.filter((k) => dsn[k][i] !== null && dsn[k][i] >= dsnMinEl);
      const earthUp = series.earth_el[i] > he, dte = earthUp && active.length > 0, sun = frac >= 0.5;
      out.sun_frac.push(frac); out.sun.push(sun); out.earth_up.push(earthUp); out.dsn_any.push(active.length > 0);
      out.dte.push(dte); out.ideal.push(sun && dte); out.hz_sun.push(hs); out.hz_earth.push(he); out.dsn_active.push(active);
    }
    return out;
  }
  /** Runs of true as [startMs, endMs); end clipped to series end (+1 s tolerance). */
  function intervals(times, flags, stepMs) {
    const out = []; let start = null;
    if (!times.length) return out;
    const tEnd = times[times.length - 1] + stepMs;
    for (let i = 0; i < times.length; i++) {
      if (flags[i] && start === null) start = times[i];
      else if (!flags[i] && start !== null) { out.push([start, times[i]]); start = null; }
    }
    if (start !== null) out.push([start, tEnd]);
    return out.map(([a, b]) => [a, Math.min(b, tEnd + 1000)]);
  }
  const hoursOf = (iv) => iv.reduce((s, [a, b]) => s + (b - a), 0) / HOUR;
  const longestGap = (times, flags, stepMs) =>
    intervals(times, flags.map((f) => !f), stepMs).reduce((m, iv) => Math.max(m, (iv[1] - iv[0]) / HOUR), 0);
  function nextChange(times, flags, i0, toValue) {
    for (let i = i0; i < times.length; i++) if (flags[i] === toValue) return times[i];
    return null;
  }
  function summarize(times, ev, returnHours = 8, nowMs = null) {
    if (!times.length) return {};
    const step = times.length > 1 ? times[1] - times[0] : HOUR;
    const now = nowMs === null ? times[0] : nowMs;
    let i0 = times.findIndex((t) => t >= now); if (i0 < 0) i0 = times.length - 1;
    const sunIv = intervals(times, ev.sun, step), dteIv = intervals(times, ev.dte, step), idealIv = intervals(times, ev.ideal, step);
    const need = returnHours * HOUR, ret = [];
    for (const [a, b] of idealIv) {
      if (b - a + 1000 >= need) {
        const s = sunIv.find(([sa, sb]) => sa <= a && a < sb + 1000);
        ret.push({ start: a, end: b, latest_start: b - need, sunset: s ? s[1] : null, hours: (b - a) / HOUR });
      }
    }
    const span = (times[times.length - 1] + step - times[0]) / HOUR;
    const sunNow = ev.sun[i0], dteNow = ev.dte[i0];
    return {
      span_hours: span, sun_hours: hoursOf(sunIv), dte_hours: hoursOf(dteIv), ideal_hours: hoursOf(idealIv),
      sun_pct: 100 * hoursOf(sunIv) / span, dte_pct: 100 * hoursOf(dteIv) / span, ideal_pct: 100 * hoursOf(idealIv) / span,
      longest_night_hours: longestGap(times, ev.sun, step), longest_no_dte_hours: longestGap(times, ev.dte, step),
      status: sunNow && dteNow ? "ideal" : sunNow ? "sun_only" : dteNow ? "dte_only" : "dark",
      next_sunset: sunNow ? nextChange(times, ev.sun, i0, false) : null,
      next_sunrise: !sunNow ? nextChange(times, ev.sun, i0, true) : null,
      next_earthset: ev.earth_up[i0] ? nextChange(times, ev.earth_up, i0, false) : null,
      next_earthrise: !ev.earth_up[i0] ? nextChange(times, ev.earth_up, i0, true) : null,
      next_ideal: (() => { const iv = idealIv.find(([, b]) => b > now); return iv ? { start: iv[0], end: iv[1] } : null; })(),
      intervals: { sun: sunIv, dte: dteIv, ideal: idealIv }, return_windows: ret, return_hours: returnHours,
    };
  }

  /** Sun elevation (deg, spherical Moon, no relief) at (lat, lon) for a subsolar point - for map shading. */
  function sphericalElevation(lat, lon, subLat, subLon) {
    return Math.asin(Math.max(-1, Math.min(1, sin(lat) * sin(subLat) + cos(lat) * cos(subLat) * cos(lon - subLon)))) * R2D;
  }

  /** Sun elevation/azimuth (geometric, no refraction) from an Earth site: Meeus ch. 13/25. */
  function sunAltazFromEarth(t, lat, lonEast) {
    const jde = jdTT(t), [ls, , ds] = sunGeocentric(jde), eps = meanObliquity(jde);
    const ra = Math.atan2(cos(eps) * sin(ls), cos(ls)) * R2D, dec = Math.asin(sin(eps) * sin(ls)) * R2D;
    const H = gmstDeg(t) + lonEast - ra;
    const el = Math.asin(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(H)) * R2D;
    const az = norm360(Math.atan2(-sin(H), Math.tan(dec * D2R) * cos(lat) - sin(lat) * cos(H)) * R2D);
    return [az, el, ds];
  }

  return { DELTA_T_S, MOON_RADIUS_KM, I_MOON, julianDay, jdTT, centuries, moonFundamental,
           moonGeocentric, sunGeocentric, selenographicSubpoint, moonState, sunEarthAltazOnMoon,
           gmstDeg, meanObliquity, moonAltazFromEarth, norm180, norm360,
           altazFromState, DSN_SITES, analyticBundle, SUN_RADIUS_DEG, depressionDeg, maskAt, effectiveHorizon,
           discFraction, evaluate, intervals, summarize, sphericalElevation, sunAltazFromEarth };
});
