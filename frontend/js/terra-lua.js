/* Da Terra à Lua - two-body (Earth only) Kepler trajectories and the link back to Janela Polar.
 * Physics (exported for node --test, see frontend/tests/orbit.test.mjs):
 *   mu = 398600.4418 km^3/s^2, parking orbit 185 km, entry interface 122 km.
 *   Hohmann: perigee at the parking orbit, apogee at the Moon's distance at arrival (~5 d, dv ~3.1 km/s).
 *   Fast: apogee beyond the Moon, found by bisection so the flight to the Moon's distance takes 3 d.
 *   The aim point is the Moon's position at arrival; arrival time and Moon distance are iterated.
 *   Return: the same kind of ellipse run backwards, from the Moon down to 122 km altitude.
 *   Return windows: departures for which the Sun is >= 10 deg above the recovery zone at entry
 *   (Apollo daylight-recovery rule).  Plane geometry: everything in the ecliptic plane (top view);
 *   the Moon's ~5 deg orbital inclination and its gravity are ignored (stated on screen).
 */
(function (root, factory) {
  const E = typeof module === "object" && module.exports ? require("./engine.js") : root.JPEngine;
  const api = factory(E);
  if (typeof module === "object" && module.exports) module.exports = api;
  else { root.JPOrbit = api; if (typeof document !== "undefined") api.startUI(); }
})(typeof self !== "undefined" ? self : this, function (E) {
  "use strict";
  const MU = 398600.4418, RE = 6378.137, PARK_KM = 185, ENTRY_KM = 122, DAY = 86400000, HOUR = 3600000;
  const BASES = [ // from the team brief (not independently verified)
    { id: "ksc", name: "Kennedy LC-39A", lat: 28.60833, lon: -80.60444 },
    { id: "wallops", name: "Wallops Pad 0A", lat: 37.8337, lon: -75.4881 },
    { id: "vandenberg", name: "Vandenberg SLC-4", lat: 34.633, lon: -120.613 },
    { id: "alcantara", name: "Alcântara", lat: -2.33944, lon: -44.4175 },
  ];
  const ZONES = [ // approximate recovery zones (team brief: all approximate)
    { id: "pacific", name: { en: "Pacific off Baja California (Artemis I area, approx.)", pt: "Pacífico perto da Baixa Califórnia (área da Artemis I, aprox.)" }, lat: 29.0, lon: -118.0 },
    { id: "florida", name: { en: "Atlantic off Florida (approx.)", pt: "Atlântico na costa da Flórida (aprox.)" }, lat: 29.5, lon: -80.0 },
    { id: "alcantara", name: { en: "Atlantic off Alcântara (hypothetical, approx.)", pt: "Atlântico perto de Alcântara (hipotética, aprox.)" }, lat: -2.0, lon: -43.5 },
  ];
  const rotationBoost = (lat) => 465.1 * Math.cos(lat * Math.PI / 180);   // m/s, eastward launch
  const minInclination = (lat) => Math.abs(lat);

  // ---------------------------------------------------------------- Kepler
  function ellipse(rp, ra) {
    const a = (rp + ra) / 2, e = (ra - rp) / (ra + rp);
    return { rp, ra, a, e, n: Math.sqrt(MU / a ** 3), p: a * (1 - e * e) };
  }
  /** time (s) from perigee to radius r on the outbound branch */
  function timeToRadius(el, r) {
    const cosnu = Math.max(-1, Math.min(1, (el.p / r - 1) / el.e));
    const nu = Math.acos(cosnu);
    const Ea = 2 * Math.atan(Math.sqrt((1 - el.e) / (1 + el.e)) * Math.tan(nu / 2));
    return { t: (Ea - el.e * Math.sin(Ea)) / el.n, nu };
  }
  /** radius and true anomaly at time t (s) after perigee */
  function stateAt(el, t) {
    const M = el.n * t;
    let Ea = M;
    for (let k = 0; k < 30; k++) { const f = Ea - el.e * Math.sin(Ea) - M; Ea -= f / (1 - el.e * Math.cos(Ea)); if (Math.abs(f) < 1e-13) break; }
    const nu = 2 * Math.atan2(Math.sqrt(1 + el.e) * Math.sin(Ea / 2), Math.sqrt(1 - el.e) * Math.cos(Ea / 2));
    return { r: el.a * (1 - el.e * Math.cos(Ea)), nu };
  }
  const vPerigee = (el) => Math.sqrt(MU * (2 / el.rp - 1 / el.a));

  /** ellipse with perigee rp whose flight from rp to r takes tofS seconds (ra > r), by bisection */
  function fastEllipse(rp, r, tofS) {
    let lo = r * 1.0000001, hi = 5e7;
    const f = (ra) => timeToRadius(ellipse(rp, ra), r).t - tofS;
    if (f(lo) < 0) return ellipse(rp, lo);           // Hohmann is already faster than asked
    for (let k = 0; k < 200; k++) { const mid = Math.sqrt(lo * hi); if (f(mid) > 0) lo = mid; else hi = mid; if (hi / lo < 1 + 1e-12) break; }
    return ellipse(rp, Math.sqrt(lo * hi));
  }

  function moonPolar(ms) {
    const [lam, , d] = E.moonGeocentric(E.jdTT(ms));
    return { theta: lam, r: d };
  }

  /** Outbound leg: launch (TLI) at tL ms.  kind = 'hohmann' | 'fast'. Iterates arrival time / Moon distance. */
  function outbound(tL, kind = "hohmann", fastDays = 3) {
    const rp = RE + PARK_KM;
    let tA = tL + (kind === "fast" ? fastDays : 5) * DAY, el = null, nuA = Math.PI, tof = 0;
    for (let it = 0; it < 8; it++) {
      const m = moonPolar(tA);
      if (kind === "fast") { el = fastEllipse(rp, m.r, fastDays * 86400); ({ nu: nuA } = timeToRadius(el, m.r)); tof = fastDays * 86400; }
      else { el = ellipse(rp, m.r); nuA = Math.PI; tof = Math.PI / el.n; }
      const next = tL + tof * 1000;
      if (Math.abs(next - tA) < 1) { tA = next; break; }
      tA = next;
    }
    const m = moonPolar(tA);
    const omega = m.theta - nuA * 180 / Math.PI;     // perigee direction (deg) so that we meet the Moon
    const vp = vPerigee(el), vc = Math.sqrt(MU / rp);
    return { kind, tL, tA, el, omega, tofS: tof, dvTLI: vp - vc, moonAtArrival: m, rp };
  }

  /** Return leg from the Moon at tD down to the entry interface. */
  function inbound(tD, kind = "hohmann", fastDays = 3) {
    const rp = RE + ENTRY_KM, m = moonPolar(tD);
    let el, nuD, tof;
    if (kind === "fast") { el = fastEllipse(rp, m.r, fastDays * 86400); ({ nu: nuD } = timeToRadius(el, m.r)); tof = fastDays * 86400; }
    else { el = ellipse(rp, m.r); nuD = Math.PI; tof = Math.PI / el.n; }
    // run backwards: at tD the craft is at true anomaly -nuD (incoming branch), reaches perigee at tE
    const omega = m.theta + nuD * 180 / Math.PI;
    return { kind, tD, tE: tD + tof * 1000, el, omega, tofS: tof, moonAtDeparture: m, rp };
  }

  /** craft polar position (theta deg, r km) on a leg at time t (ms); clamps +-1 s at the ends */
  function legPosition(leg, t, outboundLeg) {
    const t0 = outboundLeg ? leg.tL : leg.tD, t1 = outboundLeg ? leg.tA : leg.tE;
    const tc = Math.max(t0, Math.min(t1, t));
    if (outboundLeg) { const s = stateAt(leg.el, (tc - t0) / 1000); return { theta: leg.omega + s.nu * 180 / Math.PI, r: s.r }; }
    const s = stateAt(leg.el, (t1 - tc) / 1000);           // time remaining to perigee
    return { theta: leg.omega - s.nu * 180 / Math.PI, r: s.r };
  }

  function sunElevationAt(zone, t) { return E.sunAltazFromEarth(t, zone.lat, zone.lon)[1]; }

  /** Departures (hourly) from tFrom to tTo whose entry happens with the Sun >= minEl at the zone. */
  function returnWindows(tFrom, tTo, zone, kind = "hohmann", minEl = 10, stepMin = 60) {
    const flags = [], times = [], info = [];
    for (let t = tFrom; t <= tTo; t += stepMin * 60000) {
      const leg = inbound(t, kind), el = sunElevationAt(zone, leg.tE);
      times.push(t); flags.push(el >= minEl); info.push({ tE: leg.tE, el });
    }
    return E.intervals(times, flags, stepMin * 60000).map(([a, b]) => {
      const i = times.indexOf(a);
      return { start: a, end: b, firstEntry: info[i].tE, sunEl: info[i].el };
    });
  }

  function nextMoonrise(base, t0, horizonMs = 3 * DAY) {
    let prev = E.moonAltazFromEarth(t0, base.lat, base.lon)[1];
    for (let t = t0 + 10 * 60000; t <= t0 + horizonMs; t += 10 * 60000) {
      const el = E.moonAltazFromEarth(t, base.lat, base.lon)[1];
      if (prev < 0 && el >= 0) {           // refine to the minute
        let a = t - 10 * 60000, b = t;
        while (b - a > 60000) { const m = (a + b) / 2; if (E.moonAltazFromEarth(m, base.lat, base.lon)[1] >= 0) b = m; else a = m; }
        return b;
      }
      prev = el;
    }
    return null;
  }

  const api = { MU, RE, PARK_KM, ENTRY_KM, BASES, ZONES, rotationBoost, minInclination, ellipse, timeToRadius, stateAt,
                fastEllipse, outbound, inbound, legPosition, returnWindows, nextMoonrise, moonPolar, sunElevationAt, startUI };
  return api;

  // ================================================================ UI (browser only)
  function startUI() {
    const $ = (s) => document.querySelector(s), $$ = (s) => Array.from(document.querySelectorAll(s));
    const store = { get(k, d) { try { const v = localStorage.getItem("jp_" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
                    set(k, v) { try { localStorage.setItem("jp_" + k, JSON.stringify(v)); } catch { /* ignore */ } } };
    const q = new URLSearchParams(location.search);
    const today = (() => { const n = new Date(); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 12); })();
    const S = { lang: q.get("lang") === "pt" || q.get("lang") === "en" ? q.get("lang") : store.get("lang", "en"), theme: store.get("theme", "dark"),
                launch: today, delay: 0, kind: "hohmann", stay: 6.5, site: q.get("site") || "a3-malapert-massif", zone: "pacific", ret: null, cursor: 0, playing: false };
    if (q.get("launch") && /^\d{4}-\d{2}-\d{2}$/.test(q.get("launch"))) S.launch = Date.parse(q.get("launch") + "T12:00:00Z");
    document.documentElement.dataset.theme = S.theme;
    const SITES = ((window.JP_SITES_STATIC || {}).sites || []).filter((s) => s.has_coords);
    const T = {
      en: { tagline: "Sun & Earth windows for lunar landing sites", nav_polar: "Polar Window", nav_trip: "Earth to Moon", nav_data: "NASA Data",
        title: "From Earth to the Moon — and back", lead: "A launch delay shifts the arrival date, and a different landing site may then be the best lit. Plan the trip, then open the surface view for that exact site and date.",
        c_launch: "Launch (TLI, UTC)", c_delay: "Launch delay", c_kind: "Trajectory", k_h: "Hohmann (~5 d)", k_f: "Fast (3 d)", c_stay: "Surface stay", c_site: "Landing site", c_zone: "Recovery zone",
        top: "Top view (ecliptic plane)", dist: "Distance from Earth", mission: "Mission", s_tli: "TLI burn from 185 km orbit", s_arr: "Arrival at the Moon", s_moon: "Moon distance at arrival",
        s_tof: "Flight time", s_dep: "Departure from the Moon", s_entry: "Entry interface (122 km)", s_ra: "Transfer apogee",
        link_title: "Delay → arrival date → which site is lit", link_btn: "See this site and date in Janela Polar",
        link_expl: "Launching on {l} puts you at the Moon on {a}. For a {s}-day stay starting then, the share of time with Sun and direct-to-Earth contact (analytic model + LOLA terrain) is:",
        ideal: "Sun + DTE", best: "best", rw_title: "Return windows (Sun ≥ 10° at splashdown, Apollo rule)", rw_none: "No departure in the stay gives a daylight splashdown at this zone.",
        rw_line: "Leave {a} → {b} · splashdown from {c} (Sun {e}°)", open_jp: "Janela Polar", choose: "use",
        bases: "Launch sites", b_site: "Site", b_lat: "Latitude", b_boost: "Earth-rotation boost", b_inc: "Min. inclination", b_moon: "Moon now", b_rise: "Next moonrise",
        notes: "Two-body model with Earth's gravity only; the Moon's gravity and its ~5° orbital tilt are ignored, so times are good to a few hours. Launch-site coordinates come from the team brief; recovery zones are approximate. Moonrise: geometric (no atmospheric refraction).",
        legend: "rings every 100,000 km · dashed: Moon's perigee/apogee this month · Earth enlarged, lit side toward the Sun, launch sites rotating",
        out: "outbound", back: "return", stay: "on the Moon", earth: "Earth", moon: "Moon", sun: "Sun", craft: "Spacecraft", play: "Play" },
      pt: { tagline: "Janelas de Sol e Terra para locais de pouso na Lua", nav_polar: "Janela Polar", nav_trip: "Da Terra à Lua", nav_data: "Dados da NASA",
        title: "Da Terra à Lua — e de volta", lead: "Um atraso no lançamento muda a data de chegada, e outro local de pouso pode passar a ser o mais iluminado. Planeje a viagem e abra a vista da superfície para o local e a data exatos.",
        c_launch: "Lançamento (TLI, UTC)", c_delay: "Atraso", c_kind: "Trajetória", k_h: "Hohmann (~5 d)", k_f: "Rápida (3 d)", c_stay: "Estadia na superfície", c_site: "Local de pouso", c_zone: "Zona de resgate",
        top: "Vista de cima (plano da eclíptica)", dist: "Distância da Terra", mission: "Missão", s_tli: "Queima TLI a partir da órbita de 185 km", s_arr: "Chegada à Lua", s_moon: "Distância da Lua na chegada",
        s_tof: "Tempo de voo", s_dep: "Partida da Lua", s_entry: "Reentrada (122 km)", s_ra: "Apogeu da transferência",
        link_title: "Atraso → data de chegada → qual local está iluminado", link_btn: "Ver este local e esta data na Janela Polar",
        link_expl: "Lançando em {l}, você chega à Lua em {a}. Para uma estadia de {s} dias a partir daí, a fração do tempo com Sol e contato direto com a Terra (modelo analítico + relevo LOLA) é:",
        ideal: "Sol + DTE", best: "melhor", rw_title: "Janelas de volta (Sol ≥ 10° na amerissagem, regra da Apollo)", rw_none: "Nenhuma partida na estadia dá amerissagem com luz do dia nesta zona.",
        rw_line: "Partir {a} → {b} · amerissagem a partir de {c} (Sol {e}°)", open_jp: "Janela Polar", choose: "usar",
        bases: "Bases de lançamento", b_site: "Base", b_lat: "Latitude", b_boost: "Empurrão da rotação", b_inc: "Inclinação mín.", b_moon: "Lua agora", b_rise: "Próximo nascer da Lua",
        notes: "Modelo de dois corpos só com a gravidade da Terra; a gravidade da Lua e a inclinação de ~5° da órbita dela são ignoradas, então os tempos valem com erro de algumas horas. Coordenadas das bases vêm do briefing da equipe; zonas de resgate são aproximadas. Nascer da Lua: geométrico (sem refração).",
        legend: "anéis a cada 100 mil km · tracejado: perigeu/apogeu da Lua no mês · Terra ampliada, lado iluminado voltado para o Sol, bases girando",
        out: "ida", back: "volta", stay: "na Lua", earth: "Terra", moon: "Lua", sun: "Sol", craft: "Nave", play: "Animar" },
    };
    const t = (k, v = {}) => (T[S.lang][k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? "");
    const MON = { en: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"], pt: ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"] };
    const pad = (n) => String(n).padStart(2, "0");
    const fmt = (ms) => { const d = new Date(ms); return `${pad(d.getUTCDate())} ${MON[S.lang][d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`; };
    const nf = (x, d = 1) => x.toLocaleString(S.lang === "pt" ? "pt-BR" : "en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
    const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
    const fmtS = (ms) => { const d = new Date(ms); return `${pad(d.getUTCDate())} ${MON[S.lang][d.getUTCMonth()]} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
    const dur = (s) => { const h = s / 3600, d = Math.floor(h / 24); return `${d} d ${Math.round(h - 24 * d)} h`; };
    const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    let M = null;     // computed mission
    function compute() {
      const tL = S.launch + S.delay * DAY, out = outbound(tL, S.kind);
      const tStayEnd = out.tA + S.stay * DAY;
      const zone = ZONES.find((z) => z.id === S.zone);
      const rws = returnWindows(out.tA + 12 * HOUR, tStayEnd + 2 * DAY, zone, S.kind);
      // default departure: first return-window instant at or after the end of the planned stay
      const w0 = rws.find((w) => w.end > tStayEnd);
      let tD = S.ret && S.ret >= out.tA && S.ret <= tStayEnd + 2 * DAY ? S.ret : (w0 ? Math.max(w0.start, Math.ceil(tStayEnd / HOUR) * HOUR) : null);
      if (!tD) tD = tStayEnd;
      const back = inbound(tD, S.kind);
      const nominal = S.delay ? outbound(S.launch, S.kind) : null;
      M = { tL, out, back, rws, zone, tD, nominal, lit: litTable(out.tA, nominal ? nominal.tA : null) };
      S.cursor = Math.min(S.cursor, 1);
    }
    function litTable(tA, tNom) {
      const a3 = SITES.filter((s) => s.set === "artemis3" || s.id === S.site);
      const run = (t0) => {
        const startDay = Math.floor(t0 / HOUR) * HOUR, b = E.analyticBundle(a3.map((s) => ({ id: s.id, lat: s.lat, lon: s.lon })), startDay, S.stay);
        const out = {};
        for (const st of b.sites) { const s = a3.find((x) => x.id === st.id), ev = E.evaluate(st.series, b.dsn, s.horizon_mask, 0, 0, 10);
          out[st.id] = 100 * ev.ideal.filter(Boolean).length / ev.ideal.length; }
        return out;
      };
      return { sites: a3, now: run(tA), nom: tNom ? run(tNom) : null };
    }

    function render() {
      document.documentElement.lang = S.lang === "pt" ? "pt-BR" : "en";
      $$("[data-t]").forEach((el) => (el.textContent = t(el.dataset.t)));
      $("#langBtn").textContent = S.lang === "pt" ? "EN" : "PT";
      $("#oDelay").textContent = `${S.delay} d`;
      const o = M.out, b = M.back;
      $("#summary").innerHTML = [
        [t("s_tli"), `${fmt(o.tL)} · Δv ${nf(o.dvTLI, 2)} km/s`], [t("s_ra"), `${nf(o.el.ra / 1000, 0)} mil km`.replace(" mil km", S.lang === "pt" ? " mil km" : "k km")],
        [t("s_tof"), dur(o.tofS)], [t("s_arr"), fmt(o.tA)], [t("s_moon"), `${nf(o.moonAtArrival.r, 0)} km`],
        [t("s_dep"), fmt(b.tD)], [t("s_entry"), `${fmt(b.tE)} · ${dur(b.tofS)}`],
      ].map(([k, v]) => `<div class="kpi"><span>${k}</span><b>${v}</b></div>`).join("");
      // link box
      const lt = M.lit, best = Math.max(...Object.values(lt.now));
      const siteObj = SITES.find((s) => s.id === S.site);
      const href = `index.html?site=${encodeURIComponent(S.site)}&start=${iso(o.tA)}&days=30&lang=${S.lang}`;
      $("#linkBox").innerHTML = `<p>${t("link_expl", { l: fmt(o.tL), a: fmt(o.tA), s: nf(S.stay, 1) })}</p>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>${t("c_site")}</th>${lt.nom ? `<th class="num">${S.lang === "pt" ? "sem atraso" : "no delay"} (${fmtS(M.nominal.tA).slice(0, 6)})</th>` : ""}<th class="num">${t("ideal")} · ${fmtS(o.tA).slice(0, 6)}</th></tr></thead><tbody>
        ${lt.sites.slice().sort((x, y) => lt.now[y.id] - lt.now[x.id]).map((s) => `<tr class="${s.id === S.site ? "sel" : ""}" data-site="${s.id}"><td>${esc(s.name)}</td>${lt.nom ? `<td class="num">${nf(lt.nom[s.id], 0)}%</td>` : ""}<td class="num ${lt.now[s.id] === best ? "best" : ""}">${nf(lt.now[s.id], 0)}%${lt.now[s.id] === best ? " · " + t("best") : ""}</td></tr>`).join("")}
        </tbody></table></div>
        <p><a class="btn" id="jpLink" href="${href}">${t("link_btn")}: ${esc(siteObj ? siteObj.name : S.site)} · ${iso(o.tA)}</a></p>`;
      $("#linkBox").querySelectorAll("tr[data-site]").forEach((tr) => (tr.onclick = () => { S.site = tr.dataset.site; $("#cSite").value = S.site; render(); }));
      // return windows
      $("#rw").innerHTML = M.rws.length ? `<ul class="list mono">${M.rws.map((w) => `<li>${t("rw_line", { a: fmtS(w.start), b: fmtS(w.end), c: fmtS(w.firstEntry), e: nf(w.sunEl, 0) })}
        <button class="btn ghost" type="button" data-ret="${w.start}">${t("choose")}</button>
        <a href="index.html?site=${encodeURIComponent(S.site)}&start=${iso(w.start)}&days=14&lang=${S.lang}">${t("open_jp")} ↗</a></li>`).join("")}</ul>` : `<p class="small">${t("rw_none")}</p>`;
      $("#rw").querySelectorAll("[data-ret]").forEach((b2) => (b2.onclick = () => { S.ret = +b2.dataset.ret; compute(); render(); }));
      // bases
      $("#bases").innerHTML = `<thead><tr><th>${t("b_site")}</th><th class="num">${t("b_lat")}</th><th class="num">${t("b_boost")}</th><th class="num">${t("b_inc")}</th><th class="num">${t("b_moon")}</th><th>${t("b_rise")}</th></tr></thead><tbody>` +
        BASES.map((bs) => { const el = E.moonAltazFromEarth(o.tL, bs.lat, bs.lon)[1], rise = el < 0 ? nextMoonrise(bs, o.tL) : null;
          return `<tr><td>${bs.name}</td><td class="num">${nf(bs.lat, 2)}°</td><td class="num">${nf(rotationBoost(bs.lat), 0)} m/s</td><td class="num">${nf(minInclination(bs.lat), 1)}°</td><td class="num">${nf(el, 1)}°</td><td class="mono">${el >= 0 ? (S.lang === "pt" ? "já no céu" : "already up") : rise ? fmt(rise) : "—"}</td></tr>`; }).join("") + "</tbody>";
      draw();
      try { const u = new URLSearchParams(location.search); u.set("site", S.site); u.set("launch", iso(S.launch)); u.set("lang", S.lang); history.replaceState(null, "", "?" + u); } catch { /* file:// */ }
    }

    const tAt = (f) => M.out.tL + f * (M.back.tE - M.out.tL);
    function craftAt(tm) {
      if (tm <= M.out.tA) return legPosition(M.out, tm, true);
      if (tm < M.back.tD) return moonPolar(tm);
      return legPosition(M.back, tm, false);
    }
    function draw() { drawTop(); drawDist(); }
    function setup(cv, h) {
      const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth || 300;
      cv.style.height = h + "px"; cv.width = w * dpr; cv.height = h * dpr;
      const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.font = "11px 'IBM Plex Mono', monospace";
      return { ctx, w, h };
    }
    function drawTop() {
      const cv = $("#top"), W0 = cv.clientWidth || 300, { ctx, w, h } = setup(cv, Math.min(W0, 600));
      const tm = tAt(S.cursor), span = [M.out.tL - 2 * DAY, M.back.tE + 2 * DAY];
      const moonPts = []; for (let x = span[0]; x <= span[1]; x += 6 * HOUR) moonPts.push(moonPolar(x));
      const month = []; for (let x = M.out.tL; x <= M.out.tL + 28 * DAY; x += 6 * HOUR) month.push(moonPolar(x).r);
      const rMax = Math.max(...month) * 1.12, cx = w / 2, cy = h / 2, k = (Math.min(w, h) / 2 - 14) / rMax;
      const P = (th, r) => [cx + r * k * Math.cos(th * Math.PI / 180), cy - r * k * Math.sin(th * Math.PI / 180)];
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = css("--grid"); ctx.fillStyle = css("--muted");
      for (let r = 100000; r < rMax; r += 100000) { ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, 2 * Math.PI); ctx.stroke(); ctx.fillText(`${r / 1000}k km`, cx + 3, cy - r * k - 3); }
      ctx.setLineDash([5, 4]); ctx.strokeStyle = css("--muted");
      for (const r of [Math.min(...month), Math.max(...month)]) { ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, 2 * Math.PI); ctx.stroke(); }
      ctx.setLineDash([]);
      // Moon path this month
      ctx.strokeStyle = css("--ink"); ctx.globalAlpha = 0.35; ctx.beginPath(); moonPts.forEach((m, i) => { const [x, y] = P(m.theta, m.r); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); ctx.globalAlpha = 1;
      // Sun direction
      const [ls] = E.sunGeocentric(E.jdTT(tm));
      const [sx, sy] = P(ls, rMax * 0.97);
      ctx.strokeStyle = css("--sun"); ctx.fillStyle = css("--sun"); ctx.beginPath(); ctx.moveTo(...P(ls, rMax * 0.72)); ctx.lineTo(sx, sy); ctx.stroke();
      ctx.font = "15px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("☉", ...P(ls, rMax * 1.04 > rMax ? rMax * 0.99 : rMax)); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.font = "11px 'IBM Plex Mono', monospace";
      // trajectories
      const path = (t0, t1, f, dash) => { ctx.strokeStyle = css("--craft"); ctx.setLineDash(dash); ctx.lineWidth = 2; ctx.beginPath();
        for (let i = 0; i <= 200; i++) { const p = f(t0 + (t1 - t0) * i / 200); const [x, y] = P(p.theta, p.r); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1; };
      path(M.out.tL, M.out.tA, (x) => legPosition(M.out, x, true), []);
      path(M.back.tD, M.back.tE, (x) => legPosition(M.back, x, false), [6, 4]);
      // Earth enlarged, lit toward the Sun, bases rotating
      const RE_px = 24, g = E.gmstDeg(tm);
      ctx.fillStyle = css("--shadow"); ctx.beginPath(); ctx.arc(cx, cy, RE_px, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = css("--earth"); ctx.beginPath(); const a0 = -ls * Math.PI / 180; ctx.arc(cx, cy, RE_px, a0 - Math.PI / 2, a0 + Math.PI / 2); ctx.closePath(); ctx.fill();
      for (const bs of BASES) { const ang = (g + bs.lon) * Math.PI / 180, rr = RE_px * Math.cos(bs.lat * Math.PI / 180);
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx + rr * Math.cos(ang), cy - rr * Math.sin(ang), 2.5, 0, 2 * Math.PI); ctx.fill(); }
      // Moon and craft now
      const mn = moonPolar(tm), [mx, my] = P(mn.theta, mn.r);
      ctx.fillStyle = css("--lit"); ctx.beginPath(); ctx.arc(mx, my, 7, 0, 2 * Math.PI); ctx.fill();
      const lab = (txt, x, y, col) => { const m = ctx.measureText(txt).width; ctx.fillStyle = col; ctx.fillText(txt, x + 10 + m > w ? x - 10 - m : x + 10, y + 4); };
      lab(t("moon"), mx, my, css("--ink"));
      const c = craftAt(tm), [kx, ky] = P(c.theta, c.r);
      ctx.fillStyle = css("--craft"); ctx.beginPath(); ctx.arc(kx, ky, 5, 0, 2 * Math.PI); ctx.fill(); lab(t("craft"), kx, ky + 12, css("--craft"));
      $("#topTime").textContent = fmt(tm);
    }
    let distGeom = null;
    function drawDist() {
      const { ctx, w, h } = setup($("#dist"), 170), L = 46, R = 8, T0 = 8, B = 22, pw = w - L - R, ph = h - T0 - B;
      const t0 = M.out.tL, t1 = M.back.tE, X = (x) => L + (x - t0) / (t1 - t0) * pw;
      const rMax = 4.2e5 * 1.0, Y = (r) => T0 + (1 - r / rMax) * ph;
      distGeom = { L, pw };
      ctx.clearRect(0, 0, w, h); ctx.strokeStyle = css("--grid"); ctx.fillStyle = css("--muted");
      for (let r = 0; r <= 400000; r += 100000) { ctx.beginPath(); ctx.moveTo(L, Y(r)); ctx.lineTo(w - R, Y(r)); ctx.stroke(); ctx.fillText(`${r / 1000}k`, 2, Y(r) + 4); }
      ctx.setLineDash([4, 3]); ctx.strokeStyle = css("--muted"); ctx.beginPath();
      for (let i = 0; i <= 200; i++) { const x = t0 + (t1 - t0) * i / 200; i ? ctx.lineTo(X(x), Y(moonPolar(x).r)) : ctx.moveTo(X(x), Y(moonPolar(x).r)); } ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = css("--craft"); ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i <= 400; i++) { const x = t0 + (t1 - t0) * i / 400; i ? ctx.lineTo(X(x), Y(craftAt(x).r)) : ctx.moveTo(X(x), Y(craftAt(x).r)); } ctx.stroke(); ctx.lineWidth = 1;
      const nDays = (t1 - t0) / DAY, every = nDays / Math.max(3, Math.floor(pw / 70));
      const step = [1, 2, 3, 5, 7].find((s) => s >= every) || 7;
      ctx.fillStyle = css("--muted");
      for (let d = 0; d <= nDays; d += step) { const x = X(t0 + d * DAY), tx = `+${d} d`, m = ctx.measureText(tx).width; ctx.fillText(tx, Math.min(w - R - m, Math.max(L, x - m / 2)), h - 6); }
      for (const [a, b, k2] of [[t0, M.out.tA, "out"], [M.out.tA, M.back.tD, "stay"], [M.back.tD, t1, "back"]]) {
        const tx = t(k2), m = ctx.measureText(tx).width, xm = (X(a) + X(b)) / 2; if (X(b) - X(a) > m + 4) { ctx.fillStyle = css("--ink"); ctx.fillText(tx, xm - m / 2, T0 + 12); } }
      const cx2 = X(tAt(S.cursor)); ctx.strokeStyle = css("--ink"); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx2, T0); ctx.lineTo(cx2, T0 + ph); ctx.stroke(); ctx.lineWidth = 1;
    }

    // controls
    $("#cLaunch").value = iso(S.launch);
    $("#cSite").innerHTML = SITES.filter((s) => s.lat < -60).map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("");
    if (!SITES.some((s) => s.id === S.site)) S.site = (SITES.find((s) => s.set === "artemis3") || SITES[0] || {}).id;
    $("#cSite").value = S.site;
    $("#cZone").innerHTML = ZONES.map((z) => `<option value="${z.id}">${z.name[S.lang]}</option>`).join("");
    const recalc = () => { compute(); render(); };
    $("#cLaunch").onchange = (e) => { const v = Date.parse(e.target.value + "T12:00:00Z"); if (!Number.isNaN(v)) { S.launch = v; S.ret = null; recalc(); } };
    $("#cDelay").oninput = (e) => { S.delay = +e.target.value; S.ret = null; recalc(); };
    $("#cKind").onchange = (e) => { S.kind = e.target.value; S.ret = null; recalc(); };
    $("#cStay").onchange = (e) => { S.stay = +e.target.value; S.ret = null; recalc(); };
    $("#cSite").onchange = (e) => { S.site = e.target.value; render(); };
    $("#cZone").onchange = (e) => { S.zone = e.target.value; S.ret = null; recalc(); };
    $("#langBtn").onclick = () => { S.lang = S.lang === "pt" ? "en" : "pt"; store.set("lang", S.lang); $("#cZone").innerHTML = ZONES.map((z) => `<option value="${z.id}">${z.name[S.lang]}</option>`).join(""); $("#cZone").value = S.zone; render(); };
    $("#themeBtn").onclick = () => { S.theme = S.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = S.theme; store.set("theme", S.theme); draw(); };
    const dcv = $("#dist"); let drag = false;
    const fromEv = (ev) => { const r = dcv.getBoundingClientRect(); S.cursor = Math.max(0, Math.min(1, (ev.clientX - r.left - distGeom.L) / distGeom.pw)); draw(); };
    dcv.addEventListener("pointerdown", (e) => { drag = true; dcv.setPointerCapture(e.pointerId); fromEv(e); });
    dcv.addEventListener("pointermove", (e) => drag && fromEv(e));
    dcv.addEventListener("pointerup", () => (drag = false));
    $("#playBtn").onclick = () => { S.playing = !S.playing; $("#playBtn").textContent = S.playing ? "❚❚" : "▶";
      const tick = () => { if (!S.playing) return; S.cursor = (S.cursor + 0.004) % 1; draw(); requestAnimationFrame(tick); }; tick(); };
    let rz = 0; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(draw, 120); });
    recalc();
    window.JPT = { S, get M() { return M; } };
  }
});
