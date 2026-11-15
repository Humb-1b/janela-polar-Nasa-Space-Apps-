// node --test frontend/tests/*.test.mjs  — Earth-Moon trajectory physics.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const O = require("../js/terra-lua.js");
const E = require("../js/engine.js");
const T0 = Date.UTC(2026, 10, 15, 12);
const DAY = 86400000;

test("Hohmann: ~5 days and ~3.1 km/s TLI", () => {
  const o = O.outbound(T0, "hohmann");
  const days = o.tofS / 86400;
  assert.ok(days > 4.7 && days < 5.3, `tof ${days}`);
  assert.ok(o.dvTLI > 3.05 && o.dvTLI < 3.2, `dv ${o.dvTLI}`);
  assert.ok(Math.abs(o.el.ra - o.moonAtArrival.r) < 1, "apogee at the Moon's distance");
});

test("Fast: exactly 3 days, apogee beyond the Moon, more dv", () => {
  const o = O.outbound(T0, "fast"), h = O.outbound(T0, "hohmann");
  assert.ok(Math.abs(o.tofS - 3 * 86400) < 1);
  assert.ok(o.el.ra > o.moonAtArrival.r);
  assert.ok(o.dvTLI > h.dvTLI);
  const { t } = O.timeToRadius(o.el, o.moonAtArrival.r);
  assert.ok(Math.abs(t - 3 * 86400) < 1, "bisection hits 3 d");
});

test("Craft meets the Moon at arrival (iterated aim point)", () => {
  for (const kind of ["hohmann", "fast"]) {
    const o = O.outbound(T0 + 7 * DAY, kind);
    const c = O.legPosition(o, o.tA, true), m = O.moonPolar(o.tA);
    assert.ok(Math.abs(c.r - m.r) / m.r < 1e-6, `${kind} r`);
    assert.ok(Math.abs(E.norm180(c.theta - m.theta)) < 1e-6, `${kind} angle`);
  }
});

test("Leg ends: start at parking orbit, return ends at 122 km; +-1 s clamp", () => {
  const o = O.outbound(T0, "hohmann");
  assert.ok(Math.abs(O.legPosition(o, o.tL, true).r - (O.RE + 185)) < 1e-6);
  assert.ok(Math.abs(O.legPosition(o, o.tL - 1000, true).r - (O.RE + 185)) < 1e-6);
  const b = O.inbound(o.tA + 6.5 * DAY, "hohmann");
  assert.ok(Math.abs(O.legPosition(b, b.tE, false).r - (O.RE + 122)) < 1e-6);
  assert.ok(Math.abs(O.legPosition(b, b.tE + 1000, false).r - (O.RE + 122)) < 1e-6);   // rounding past the end
  const start = O.legPosition(b, b.tD, false), m = O.moonPolar(b.tD);
  assert.ok(Math.abs(start.r - m.r) < 1 && Math.abs(E.norm180(start.theta - m.theta)) < 1e-6, "return starts at the Moon");
});

test("Return windows satisfy the Apollo daylight rule", () => {
  const z = O.ZONES[0];
  const w = O.returnWindows(T0, T0 + 3 * DAY, z, "hohmann");
  assert.ok(w.length >= 2);
  for (const x of w) {
    const b = O.inbound(x.start, "hohmann");
    assert.ok(O.sunElevationAt(z, b.tE) >= 10);
  }
});

test("Launch sites: rotation boost and minimum inclination", () => {
  const ksc = O.BASES.find((b) => b.id === "ksc"), alc = O.BASES.find((b) => b.id === "alcantara");
  assert.ok(Math.abs(O.rotationBoost(ksc.lat) - 465.1 * Math.cos(ksc.lat * Math.PI / 180)) < 1e-9);
  assert.ok(O.rotationBoost(alc.lat) > O.rotationBoost(ksc.lat));
  assert.equal(O.minInclination(alc.lat), 2.33944);
  const r = O.nextMoonrise(ksc, T0);
  assert.ok(r && r > T0 && r < T0 + 2 * DAY);
  assert.ok(Math.abs(E.moonAltazFromEarth(r, ksc.lat, ksc.lon)[1]) < 0.3);
});
