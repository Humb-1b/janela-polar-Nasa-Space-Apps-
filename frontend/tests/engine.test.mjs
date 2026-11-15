// node --test frontend/tests/   — JS engine must match analytic.py to 1e-7 deg.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const E = require("../js/engine.js");
const ref = JSON.parse(readFileSync(new URL("./fixtures/py_reference.json", import.meta.url)));
const TOL_DEG = 1e-7, TOL_KM = 1e-4;
const adiff = (a, b) => Math.abs(E.norm180(a - b));

test("Meeus example 47.a (1992-04-12 0h TD)", () => {
  const [l, b, d] = E.moonGeocentric(2448724.5);
  assert.ok(Math.abs(l - 133.162655) < 2e-5 && Math.abs(b + 3.229126) < 2e-5 && Math.abs(d - 368409.7) < 0.2);
});

test("JS == Python: selenographic sub-points", () => {
  for (const c of ref.cases) {
    const s = E.moonState(c.t_ms);
    for (const k of ["subearth_lon", "subsolar_lon"]) assert.ok(adiff(s[k], c.state[k]) < TOL_DEG, k);
    for (const k of ["subearth_lat", "subsolar_lat"]) assert.ok(Math.abs(s[k] - c.state[k]) < TOL_DEG, k);
    assert.ok(Math.abs(s.earth_dist_km - c.state.earth_dist_km) < TOL_KM);
    assert.ok(Math.abs(s.sun_dist_km - c.state.sun_dist_km) < 1);
  }
});

test("JS == Python: Sun/Earth az-el on the Moon", () => {
  let n = 0;
  for (const c of ref.cases) for (const p of c.moon) {
    const r = E.sunEarthAltazOnMoon(c.t_ms, p.lat, p.lon, p.alt_km);
    for (const body of ["sun", "earth"]) {
      assert.ok(adiff(r[body][0], p[body][0]) < 1e-6, `${body} az`);
      assert.ok(Math.abs(r[body][1] - p[body][1]) < TOL_DEG, `${body} el`);
      n++;
    }
  }
  assert.ok(n > 200);
});

test("JS == Python: Moon from DSN complexes", () => {
  for (const c of ref.cases) for (const p of c.dsn) {
    const [az, el] = E.moonAltazFromEarth(c.t_ms, p.lat, p.lon);
    assert.ok(adiff(az, p.azel[0]) < 1e-6 && Math.abs(el - p.azel[1]) < TOL_DEG);
  }
});
