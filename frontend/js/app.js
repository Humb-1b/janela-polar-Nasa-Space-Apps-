/* Janela Polar - main page.
 * Data sources, in order (badge shows which one is active):
 *   1. backend API /api/bundle (JPL Horizons, or its analytic fallback)
 *   2. precomputed bundle frontend/data/bundle-YYYY-MM-DD-30d.json (Horizons, made by CI)
 *   3. analytic engine in the browser (engine.js)
 * Order of work on every change: load -> compute windows -> draw (never draw before compute).
 */
(() => {
  "use strict";
  const E = window.JPEngine;
  const HOUR = 3600000, DAY = 86400000;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // ------------------------------------------------------------------ i18n
  const I18N = {
    en: {
      tagline: "Sun & Earth windows for lunar landing sites", nav_polar: "Polar Window", nav_trip: "Earth to Moon", nav_data: "NASA Data",
      scn_title: "Guided Mission Scenarios", scn1: "Launch Delay (+5 days at Malapert)", scn2: "3 km Spatial Contrast", scn3: "Far Side Relay Need (Chang'e 6)",
      c_set: "Sites", set_all: "All", set_artemis3: "Artemis III regions", set_landers: "Recent landers", set_apollo: "Apollo", set_mine: "My sites",
      c_start: "Start (UTC)", c_days: "Period", c_margin: "Horizon margin", c_height: "Point height", c_dsn: "DSN min. elevation", c_return: "Return window ≥",
      map_title: "Map", map_polar: "South polar", map_global: "Whole Moon", map_earthline: "Earth on horizon",
      map_note: "Map shading: analytic model on a smooth sphere (no terrain). Site colours use the active data source and LOLA terrain when available.",
      st_ideal: "Ideal", st_sun_only: "Sun only", st_dte_only: "DTE only", st_dark: "Dark", st_pending: "Coordinates pending",
      hz_title: "Local horizon", hz_sub: "Sun & Earth paths over the period", tl_title: "Timeline", csv: "Download CSV",
      hm_title: "Best landing date", hm_mission: "Mission length",
      hm_note: "Colour = share of the mission with Sun and DTE together, if landing on that day (00:00 UTC). Click a cell to open that site and date.",
      cmp_title: "Compare sites", pt_title: "Add your own coordinate", pt_add: "Add", pin_title: "Pinned scenarios", pin_sub: "site + date, best value of each column highlighted",
      why_title: "Why is the south pole different?",
      why_1: "<b>The Sun skims the horizon.</b> The Moon's axis is tilted only ~1.5° to the ecliptic, so near the pole the Sun never climbs more than 1–2° above the horizon. It circles the sky once per lunar day (~29.5 Earth days).",
      why_2: "<b>A mountain 20 km away decides everything.</b> With no atmosphere there is no refraction or twilight: the horizon is the terrain itself. A ridge 1° high blocks the Sun completely, while a crest a few km away can stay lit for weeks.",
      why_3: "<b>Earth hangs low and wobbles.</b> Earth stays almost fixed in the sky, but libration rocks it by up to ~7°. At the pole it hovers near the horizon, so the same terrain decides direct-to-Earth radio (DTE), which also needs a DSN antenna on Earth that sees the Moon.",
      foot_sources: "Sources: <a href='https://ssd.jpl.nasa.gov/horizons/'>JPL Horizons</a> (ephemerides) · J. Meeus, <i>Astronomical Algorithms</i> 2nd ed. (analytic fallback) · <a href='https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html'>NASA NSSDC</a> (lander positions) · USGS, McClernan 2024, doi:10.5066/P1MEQ6UK (Artemis III regions, from LROC QuickMap) · <a href='https://pgda.gsfc.nasa.gov/products/90'>LOLA DEMs, NASA PGDA</a> (terrain). DSN complex coordinates are approximate.",
      foot_ai: "Built for the NASA Space Apps Challenge 2026. Code and texts written with AI assistance and reviewed by the team (see README). Not an official NASA product.",
      src_horizons: "JPL Horizons · live", src_fallback: "Analytic · Horizons unavailable", src_bundle: "Horizons · precomputed {d}", src_analytic: "Analytic model · browser",
      src_mixed: " (+ custom points analytic)", loading: "Loading…",
      p_coords: "Coordinates", p_source: "Position source", cs_verified: "verified", cs_pending_usgs: "pending (USGS)", cs_approximate: "approximate", cs_user: "user input",
      k_sun: "Sun el / az", k_earth: "Earth el / az", k_sunset: "Sunset in", k_sunrise: "Sunrise in", k_earthset: "Earthset in", k_earthrise: "Earthrise in",
      k_nextideal: "Next ideal window", k_night: "Longest night", k_nodte: "Longest no-DTE", k_sunpct: "Sun", k_dtepct: "DTE", k_idealpct: "Ideal",
      now: "now", none_in_period: "none in period", beyond: "beyond period",
      h_dsn: "DSN antennas seeing the Moon", h_return: "Return windows (≥ {h} h ideal, depart before sunset)", no_dsn: "none (Moon below {e}° at all complexes)",
      no_return: "No ideal stretch of {h} h in this period.", ret_line: "{a} → latest start {b} · sunset {c}",
      pin: "Pin site + date", copy: "Copy coordinates", copied: "Copied", pending_msg: "Official region geometry from USGS (McClernan 2024) not loaded yet; no calculations until verified coordinates are added.",
      pl_ideal: "Sunlit and in direct radio contact with Earth.", pl_sun_only: "Sunlit, but no direct link to Earth: {why}.", pl_dte_only: "In darkness, but Earth is in view: radio contact is possible.",
      pl_dark: "In darkness and out of direct contact with Earth.", why_earth_down: "Earth is below the horizon", why_no_dsn: "no DSN antenna on Earth can see the Moon now",
      shadow: "The Sun is {el}° up: a 1.8 m astronaut casts a {L} shadow.", shadow_none: "The Sun is hidden ({el}° vs. horizon {hz}°).",
      tl_sun: "SUN", tl_dte: "DTE", tl_ideal: "IDEAL", tl_ret: "RETURN", tl_el: "Sun el", tl_hz: "terrain toward Sun",
      cm_site: "Site", cm_set: "Set", cm_sun: "Sun %", cm_dte: "DTE %", cm_ideal: "Ideal %", cm_night: "Longest night h", cm_nodte: "Longest no-DTE h", cm_ret: "Return windows", cm_now: "Status at cursor",
      pn_site: "Site", pn_land: "Landing (UTC)", pn_sun: "Sun h", pn_dte: "DTE h", pn_ideal: "Ideal h", pn_dark: "Longest dark h", pn_el: "Sun el at landing", pn_empty: "Pin a site and date from the site panel, or run scenario 1.",
      pn_out: "outside loaded period", pt_bad: "Latitude −90…90 and longitude −180…360 (east).", pt_ok: "Added “{n}”.",
      heat_info: "{s} · landing {d}: {p}% of {m} d with Sun + DTE", heat_na: "mission would end after the loaded period",
      mission: "mission", pending_scn: "This scenario needs the official USGS coordinates for {s}, which are not loaded yet (stage 4).",
      s1_title: "Launch delay: +5 days at Malapert", s1_body: "Plan: land at {a} on {d0} for a {m}-day stay. A 5-day launch delay moves the arrival to {d1}. Below, the share of the stay with Sun and DTE together (from the active data source).",
      s1_k0: "Original plan · {a}", s1_k1: "Delayed +5 d · {a}", s1_k2: "Alternative · {b}", s1_end: "Lesson: a delay changes the arrival date, and with it which site is lit. The three cases are now pinned below for comparison.",
      s3_title: "Far side: sunlight without Earth", s3_body: "{s} is on the far side. Over this period it gets {sun}% sunlight — a normal lunar day/night cycle — but {dte} hours of direct-to-Earth contact: Earth never rises there. Chang'e 6 talked to Earth through the Queqiao-2 relay satellite.",
      s3_k0: "Sunlight", s3_k1: "DTE hours", s3_k2: "Longest night",
      s2_title: "3 km spatial contrast", pair_wait: "<b>Ridge vs. depression (stage 4):</b> a pair of points a few km apart, with LOLA terrain, will appear here once the masks are generated.",
    },
    pt: {
      tagline: "Janelas de Sol e Terra para locais de pouso na Lua", nav_polar: "Janela Polar", nav_trip: "Da Terra à Lua", nav_data: "Dados da NASA",
      scn_title: "Cenários guiados de missão", scn1: "Atraso no lançamento (+5 dias em Malapert)", scn2: "Contraste a 3 km", scn3: "Lado oculto precisa de relé (Chang'e 6)",
      c_set: "Locais", set_all: "Todos", set_artemis3: "Regiões Artemis III", set_landers: "Pousos recentes", set_apollo: "Apollo", set_mine: "Meus locais",
      c_start: "Início (UTC)", c_days: "Período", c_margin: "Margem do horizonte", c_height: "Altura do ponto", c_dsn: "Elevação mín. DSN", c_return: "Janela de volta ≥",
      map_title: "Mapa", map_polar: "Polo sul", map_global: "Lua inteira", map_earthline: "Terra no horizonte",
      map_note: "Sombreamento do mapa: modelo analítico numa esfera lisa (sem relevo). As cores dos locais usam a fonte de dados ativa e o relevo LOLA quando disponível.",
      st_ideal: "Ideal", st_sun_only: "Só Sol", st_dte_only: "Só DTE", st_dark: "Escuro", st_pending: "Coordenadas pendentes",
      hz_title: "Horizonte local", hz_sub: "Trajetórias do Sol e da Terra no período", tl_title: "Linha do tempo", csv: "Baixar CSV",
      hm_title: "Melhor data de pouso", hm_mission: "Duração da missão",
      hm_note: "Cor = fração da missão com Sol e DTE ao mesmo tempo, pousando naquele dia (00:00 UTC). Clique numa célula para abrir o local e a data.",
      cmp_title: "Comparar locais", pt_title: "Adicione sua coordenada", pt_add: "Adicionar", pin_title: "Cenários fixados", pin_sub: "local + data, melhor valor de cada coluna destacado",
      why_title: "Por que o polo sul é diferente?",
      why_1: "<b>O Sol rasteja no horizonte.</b> O eixo da Lua é inclinado só ~1,5° em relação à eclíptica, então perto do polo o Sol nunca sobe mais que 1–2° acima do horizonte. Ele dá uma volta no céu a cada dia lunar (~29,5 dias terrestres).",
      why_2: "<b>Uma montanha a 20 km decide tudo.</b> Sem atmosfera não há refração nem crepúsculo: o horizonte é o próprio relevo. Uma crista de 1° de altura bloqueia o Sol inteiro, enquanto um topo a poucos km pode ficar iluminado por semanas.",
      why_3: "<b>A Terra fica baixa e balança.</b> A Terra quase não se move no céu, mas a libração a desloca até ~7°. No polo ela fica rente ao horizonte, então o mesmo relevo decide o rádio direto com a Terra (DTE), que também precisa de uma antena da DSN que veja a Lua.",
      foot_sources: "Fontes: <a href='https://ssd.jpl.nasa.gov/horizons/'>JPL Horizons</a> (efemérides) · J. Meeus, <i>Astronomical Algorithms</i> 2ª ed. (modelo de reserva) · <a href='https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html'>NASA NSSDC</a> (posição dos pousos) · USGS, McClernan 2024, doi:10.5066/P1MEQ6UK (regiões Artemis III, do LROC QuickMap) · <a href='https://pgda.gsfc.nasa.gov/products/90'>DEMs LOLA, NASA PGDA</a> (relevo). Coordenadas das antenas DSN aproximadas.",
      foot_ai: "Feito para o NASA Space Apps Challenge 2026. Código e textos escritos com ajuda de IA e revisados pela equipe (ver README). Não é um produto oficial da NASA.",
      src_horizons: "JPL Horizons · ao vivo", src_fallback: "Analítico · Horizons indisponível", src_bundle: "Horizons · pré-calculado {d}", src_analytic: "Modelo analítico · navegador",
      src_mixed: " (+ pontos próprios analíticos)", loading: "Carregando…",
      p_coords: "Coordenadas", p_source: "Fonte da posição", cs_verified: "conferida", cs_pending_usgs: "pendente (USGS)", cs_approximate: "aproximada", cs_user: "digitada",
      k_sun: "Sol el / az", k_earth: "Terra el / az", k_sunset: "Pôr do Sol em", k_sunrise: "Nascer do Sol em", k_earthset: "Pôr da Terra em", k_earthrise: "Nascer da Terra em",
      k_nextideal: "Próxima janela ideal", k_night: "Noite mais longa", k_nodte: "Maior tempo sem DTE", k_sunpct: "Sol", k_dtepct: "DTE", k_idealpct: "Ideal",
      now: "agora", none_in_period: "nenhuma no período", beyond: "além do período",
      h_dsn: "Antenas DSN vendo a Lua", h_return: "Janelas de volta (≥ {h} h ideais, partir antes do pôr do Sol)", no_dsn: "nenhuma (Lua abaixo de {e}° em todos os complexos)",
      no_return: "Nenhum trecho ideal de {h} h neste período.", ret_line: "{a} → início até {b} · pôr do Sol {c}",
      pin: "Fixar local + data", copy: "Copiar coordenadas", copied: "Copiado", pending_msg: "A geometria oficial da região (USGS, McClernan 2024) ainda não foi carregada; sem cálculos até termos coordenadas verificadas.",
      pl_ideal: "Iluminado e em contato direto por rádio com a Terra.", pl_sun_only: "Iluminado, mas sem ligação direta com a Terra: {why}.", pl_dte_only: "No escuro, mas a Terra está à vista: contato por rádio é possível.",
      pl_dark: "No escuro e sem contato direto com a Terra.", why_earth_down: "a Terra está abaixo do horizonte", why_no_dsn: "nenhuma antena da DSN na Terra vê a Lua agora",
      shadow: "O Sol está a {el}°: um astronauta de 1,8 m projeta uma sombra de {L}.", shadow_none: "O Sol está escondido ({el}° contra horizonte de {hz}°).",
      tl_sun: "SOL", tl_dte: "DTE", tl_ideal: "IDEAL", tl_ret: "VOLTA", tl_el: "Elev. Sol", tl_hz: "relevo na direção do Sol",
      cm_site: "Local", cm_set: "Grupo", cm_sun: "Sol %", cm_dte: "DTE %", cm_ideal: "Ideal %", cm_night: "Noite mais longa h", cm_nodte: "Maior sem DTE h", cm_ret: "Janelas de volta", cm_now: "Estado no cursor",
      pn_site: "Local", pn_land: "Pouso (UTC)", pn_sun: "Sol h", pn_dte: "DTE h", pn_ideal: "Ideal h", pn_dark: "Maior escuro h", pn_el: "Elev. Sol no pouso", pn_empty: "Fixe um local e uma data no painel do local, ou rode o cenário 1.",
      pn_out: "fora do período carregado", pt_bad: "Latitude −90…90 e longitude −180…360 (leste).", pt_ok: "“{n}” adicionado.",
      heat_info: "{s} · pouso {d}: {p}% de {m} d com Sol + DTE", heat_na: "a missão terminaria depois do período carregado",
      mission: "missão", pending_scn: "Este cenário precisa das coordenadas oficiais do USGS para {s}, que ainda não foram carregadas (etapa 4).",
      s1_title: "Atraso no lançamento: +5 dias em Malapert", s1_body: "Plano: pousar em {a} em {d0} para {m} dias de estadia. Um atraso de 5 dias no lançamento leva a chegada para {d1}. Abaixo, a fração da estadia com Sol e DTE juntos (fonte de dados ativa).",
      s1_k0: "Plano original · {a}", s1_k1: "Atraso +5 d · {a}", s1_k2: "Alternativa · {b}", s1_end: "Lição: o atraso muda a data de chegada, e com ela qual local está iluminado. Os três casos foram fixados abaixo para comparar.",
      s3_title: "Lado oculto: Sol sem Terra", s3_body: "{s} fica no lado oculto. Neste período recebe {sun}% de luz do Sol — o ciclo normal de dia e noite lunar — mas {dte} horas de contato direto com a Terra: a Terra nunca nasce lá. O Chang'e 6 falou com a Terra pelo satélite relé Queqiao-2.",
      s3_k0: "Luz do Sol", s3_k1: "Horas de DTE", s3_k2: "Noite mais longa",
      s2_title: "Contraste a 3 km", pair_wait: "<b>Crista × depressão (etapa 4):</b> um par de pontos a poucos km um do outro, com relevo LOLA, aparece aqui quando as máscaras forem geradas.",
    },
  };
  const MONTHS = { en: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"], pt: ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"] };
  const t = (k, vars = {}) => (I18N[S.lang][k] ?? I18N.en[k] ?? k).replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? "");
  const nf = (x, d = 1) => (x === null || x === undefined || Number.isNaN(x)) ? "—" :
    x.toLocaleString(S.lang === "pt" ? "pt-BR" : "en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const pad = (n) => String(n).padStart(2, "0");
  function fmtT(ms, withYear = true) {
    if (ms === null || ms === undefined) return "—";
    const d = new Date(ms);
    return `${pad(d.getUTCDate())} ${MONTHS[S.lang][d.getUTCMonth()]}${withYear ? " " + d.getUTCFullYear() : ""} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  }
  const fmtDay = (ms) => { const d = new Date(ms); return `${pad(d.getUTCDate())} ${MONTHS[S.lang][d.getUTCMonth()]}`; };
  function fmtDur(h) {
    if (h === null || h === undefined) return "—";
    if (h < 1 / 60) return t("now");
    const d = Math.floor(h / 24), r = Math.round(h - d * 24);
    return d ? `${d} d ${r} h` : `${Math.round(h)} h`;
  }
  const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);

  // ------------------------------------------------------------------ state + URL
  const todayUTC = () => { const n = new Date(); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()); };
  const S = { lang: "en", theme: "dark", set: "all", start: todayUTC(), days: 30, margin: 0, height: 0, dsnMin: 10, returnHours: 8,
              missionDays: 6.5, siteId: null, cursor: 0, mapMode: "polar", mission: null, pins: [], mine: [], sort: { key: "ideal_pct", asc: false }, playing: false };
  const store = {
    get(k, d) { try { const v = localStorage.getItem("jp_" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("jp_" + k, JSON.stringify(v)); } catch { /* private mode / file:// */ } },
  };
  function readURL() {
    const q = new URLSearchParams(location.search);
    if (q.get("lang") === "pt" || q.get("lang") === "en") S.lang = q.get("lang");
    else if ((navigator.language || "").toLowerCase().startsWith("pt") && !q.has("lang")) S.lang = store.get("lang", "en");
    else S.lang = store.get("lang", "en");
    const st = q.get("start");
    if (st && /^\d{4}-\d{2}-\d{2}$/.test(st) && !Number.isNaN(Date.parse(st + "T00:00:00Z"))) S.start = Date.parse(st + "T00:00:00Z");
    const d = parseInt(q.get("days"), 10);
    if ([14, 30, 60, 90].includes(d)) S.days = d; else if (d >= 1 && d <= 90) S.days = d;
    if (q.get("site")) S.siteId = q.get("site");
    S.theme = store.get("theme", "dark");
    S.mine = store.get("mine", []);
    S.pins = store.get("pins", []);
  }
  function writeURL() {
    const q = new URLSearchParams(location.search);
    q.set("site", S.siteId || ""); q.set("start", isoDate(S.start)); q.set("days", S.days); q.set("lang", S.lang);
    try { history.replaceState(null, "", location.pathname + "?" + q.toString()); } catch { /* file:// in some browsers */ }
  }

  // ------------------------------------------------------------------ sites
  const STATIC = (window.JP_SITES_STATIC && window.JP_SITES_STATIC.sites) || [];
  function allSites() {
    return STATIC.concat(S.mine.map((m) => ({ id: m.id, name: m.name, set: "mine", lat: m.lat, lon: m.lon, has_coords: true,
      coord_status: "user", horizon_mask: null, has_horizon_mask: false })));
  }
  const siteById = (id) => allSites().find((s) => s.id === id);
  const visibleSites = () => allSites().filter((s) => S.set === "all" || s.set === S.set);
  const ready = (s) => s && s.has_coords && D && D.series[s.id];

  // ------------------------------------------------------------------ data loading
  let D = null, loadId = 0, ctrl = null;
  const toMs = (x) => (typeof x === "number" ? x : Date.parse(x));

  async function fetchJSON(url, signal, timeoutMs = 120000) {
    const c = new AbortController(), tm = setTimeout(() => c.abort(), timeoutMs);
    const relay = () => c.abort();
    signal.addEventListener("abort", relay);
    try {
      const r = await fetch(url, { signal: c.signal, cache: "no-cache" });
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      return await r.json();
    } finally { clearTimeout(tm); signal.removeEventListener("abort", relay); }
  }
  function fromBundle(j, src, detail) {
    const times = j.times.map(toMs), series = {}, masks = {};
    for (const s of j.sites) { series[s.id] = s.series; if (s.horizon_mask) masks[s.id] = s.horizon_mask; }
    return { source: src, detail, times, dsn: j.dsn, series, masks, meta: j.meta };
  }
  function sliceData(d, startMs, days) {
    const i0 = d.times.findIndex((x) => x >= startMs), n = Math.round(days * 24 * HOUR / (d.times[1] - d.times[0]));
    if (i0 < 0 || i0 + n > d.times.length) return null;
    const cut = (a) => a.slice(i0, i0 + n), series = {}, dsn = {};
    for (const [id, s] of Object.entries(d.series)) series[id] = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, cut(v)]));
    for (const [k, v] of Object.entries(d.dsn)) dsn[k] = cut(v);
    return { ...d, times: cut(d.times), series, dsn };
  }
  async function tryAPI(signal) {
    if (!/^https?:$/.test(location.protocol)) throw new Error("no server");
    const j = await fetchJSON(`api/bundle?start=${isoDate(S.start)}&days=${S.days}&mode=auto`, signal);
    const src = j.meta.sources.includes("analytic-fallback") ? "fallback" : "horizons";
    return fromBundle(j, src, "");
  }
  async function tryStaticBundle(signal) {
    if (!/^https?:$/.test(location.protocol)) throw new Error("file:// blocks fetch");
    const man = await fetchJSON("data/bundles.json", signal);
    const end = S.start + S.days * DAY;
    const b = man.bundles.find((e) => Date.parse(e.start + "T00:00:00Z") <= S.start && Date.parse(e.start + "T00:00:00Z") + e.days * DAY >= end);
    if (!b) throw new Error("no bundle covers the period");
    const d = sliceData(fromBundle(await fetchJSON("data/" + b.file, signal), "bundle", b.generated_utc.slice(0, 10)), S.start, S.days);
    if (!d) throw new Error("bundle slice failed");
    return d;
  }
  function analyticData(points) {
    const b = E.analyticBundle(points, S.start, S.days);
    const series = {};
    for (const s of b.sites) series[s.id] = s.series;
    return { source: "analytic", detail: "", times: b.times, dsn: b.dsn, series, masks: {} };
  }
  async function addCustomPoints(d, signal) {
    const pts = S.mine.filter((m) => !d.series[m.id]);
    if (!pts.length) return;
    if (d.source === "horizons" || d.source === "fallback") {
      for (const p of pts) {
        try {
          const j = await fetchJSON(`api/point?lat=${p.lat}&lon=${p.lon}&start=${isoDate(S.start)}&days=${S.days}&mode=auto`, signal);
          d.series[p.id] = { sun_az: j.series.sun_az, sun_el: j.series.sun_el, earth_az: j.series.earth_az, earth_el: j.series.earth_el };
        } catch (e) { if (signal.aborted) throw e; }
      }
    }
    const rest = S.mine.filter((m) => !d.series[m.id]);
    if (rest.length) {
      const a = analyticData(rest);
      Object.assign(d.series, a.series);
      d.mixed = true;
    }
  }
  async function load() {
    const my = ++loadId;
    if (ctrl) ctrl.abort();              // stale responses must never overwrite new ones
    ctrl = new AbortController();
    const signal = ctrl.signal;
    setBadge(null);
    let d = null;
    for (const f of [tryAPI, tryStaticBundle]) {
      try { d = await f(signal); break; } catch (e) { if (signal.aborted || my !== loadId) return; }  // timeout/404 -> next source
    }
    if (!d) d = analyticData(STATIC.filter((s) => s.has_coords).map((s) => ({ id: s.id, lat: s.lat, lon: s.lon })));
    try { await addCustomPoints(d, signal); } catch (e) { if (signal.aborted) return; }
    if (my !== loadId) return;
    for (const s of STATIC) if (s.horizon_mask && !d.masks[s.id]) d.masks[s.id] = s.horizon_mask;
    D = d;
    S.cursor = Math.min(S.cursor, D.times.length - 1);
    compute();
    if (!ready(siteById(S.siteId))) S.siteId = (ready(siteById("im2")) ? "im2" : (visibleSites().find(ready) || {}).id) || null;
    renderAll();
  }

  // ------------------------------------------------------------------ compute (always before drawing)
  let EV = {};
  function compute() {
    EV = {};
    if (!D) return;
    for (const s of allSites()) {
      const ser = D.series[s.id];
      if (!ser || !s.has_coords) continue;
      const ev = E.evaluate(ser, D.dsn, D.masks[s.id] || null, S.margin, S.height, S.dsnMin);
      EV[s.id] = { ev, summ: E.summarize(D.times, ev, S.returnHours), prefix: prefixSum(ev.ideal) };
    }
  }
  function prefixSum(flags) { const p = [0]; for (const f of flags) p.push(p[p.length - 1] + (f ? 1 : 0)); return p; }
  const stepH = () => (D && D.times.length > 1 ? (D.times[1] - D.times[0]) / HOUR : 1);
  function windowStats(id, t0, days) {
    const e = EV[id]; if (!e) return null;
    const i0 = D.times.findIndex((x) => x >= t0), n = Math.round(days * 24 / stepH());
    if (i0 < 0 || i0 + n > D.times.length) return null;
    const sl = (a) => a.slice(i0, i0 + n), sh = stepH();
    const cnt = (a) => sl(a).filter(Boolean).length * sh;
    let run = 0, best = 0;
    for (const f of sl(e.ev.sun)) { run = f ? 0 : run + sh; best = Math.max(best, run); }
    return { sun: cnt(e.ev.sun), dte: cnt(e.ev.dte), ideal: cnt(e.ev.ideal), dark: best, el: D.series[id].sun_el[i0], frac: cnt(e.ev.ideal) / (n * sh) };
  }

  // ------------------------------------------------------------------ canvas helpers
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  function setup(canvas, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), w = canvas.clientWidth || 300;
    canvas.style.height = h + "px";
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = "11px 'IBM Plex Mono', monospace";
    return { ctx, w, h };
  }
  /** Label that never leaves the canvas: measured, aligned to whichever side fits. */
  function label(ctx, txt, x, y, W, color, pad = 4) {
    const m = ctx.measureText(txt).width;
    ctx.fillStyle = color;
    if (x + pad + m <= W) { ctx.textAlign = "left"; ctx.fillText(txt, x + pad, y); }
    else { ctx.textAlign = "right"; ctx.fillText(txt, Math.max(m, x - pad), y); }
    ctx.textAlign = "left";
  }
  const statusColor = (st) => ({ ideal: css("--ideal"), sun_only: css("--sun"), dte_only: css("--earth"), dark: css("--dark") }[st] || css("--muted"));
  function statusAt(id, i) {
    const e = EV[id]; if (!e) return null;
    const ev = e.ev;
    return ev.ideal[i] ? "ideal" : ev.sun[i] ? "sun_only" : ev.dte[i] ? "dte_only" : "dark";
  }
  function hexToRgb(c) {
    if (c.startsWith("#")) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    const m = c.match(/\d+/g); return m ? m.slice(0, 3).map(Number) : [128, 128, 128];
  }

  // ------------------------------------------------------------------ badge
  function setBadge(d) {
    const b = $("#srcBadge");
    b.className = "badge";
    if (!d) { b.textContent = t("loading"); return; }
    const txt = { horizons: t("src_horizons"), fallback: t("src_fallback"), bundle: t("src_bundle", { d: d.detail }), analytic: t("src_analytic") }[d.source];
    b.textContent = txt + (d.mixed ? t("src_mixed") : "");
    b.classList.add(d.source === "horizons" ? "src-horizons" : d.source === "bundle" ? "src-bundle" : "src-analytic");
    b.title = d.source === "fallback" && d.meta ? (d.meta.horizons_errors || []).join("\n") : "";
  }

  // ------------------------------------------------------------------ map
  let mapHits = [];
  function renderMap() {
    const cv = $("#map"), W = cv.clientWidth || 300;
    const H = S.mapMode === "polar" ? Math.min(W, 560) : Math.round(W / 2);
    const { ctx, w, h } = setup(cv, H);
    const st = E.moonState(D.times[S.cursor]);
    const lit = hexToRgb(css("--lit")), shd = hexToRgb(css("--shadow")), ea = hexToRgb(css("--earth"));
    const vis = visibleSites().filter(ready);
    mapHits = [];
    let proj, inv;
    if (S.mapMode === "polar") {
      const polar = vis.filter((s) => s.lat < -75);  // polar view: sites within 15 deg of the pole
      const maxColat = Math.max(4, ...polar.map((s) => 90 + s.lat + 1.2));
      const ext = Math.min(30, maxColat), R = Math.min(w, h) / 2 - 18, cx = w / 2, cy = h / 2;
      const rho = (lat) => 2 * Math.tan(((90 + lat) * Math.PI / 180) / 2), k = R / rho(-90 + ext);
      proj = (lat, lon) => { const r = rho(lat) * k, a = lon * Math.PI / 180; return [cx + r * Math.sin(a), cy - r * Math.cos(a)]; };
      inv = (x, y) => { const dx = x - cx, dy = cy - y, r = Math.hypot(dx, dy) / k; if (r > rho(-90 + ext)) return null;
        return [2 * Math.atan(r / 2) * 180 / Math.PI - 90, Math.atan2(dx, dy) * 180 / Math.PI]; };
      shade(ctx, w, h, inv, st, lit, shd, ea, (2 * ext) / Math.min(w, h));
      ctx.strokeStyle = css("--grid"); ctx.lineWidth = 1; ctx.fillStyle = css("--muted");
      const stepLat = ext > 12 ? 5 : ext > 6 ? 2 : 1;
      for (let c = stepLat; c <= ext + 1e-9; c += stepLat) {
        const r = rho(-90 + c) * k; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke();
        ctx.fillText(`${90 - c}°S`, cx + 3, cy - r - 3);
      }
      for (let lon = 0; lon < 360; lon += 30) {
        const [x, y] = proj(-90 + ext, lon); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
        const [lx, ly] = proj(-90 + ext * 1.0, lon), tx = lon === 0 ? "0°" : lon === 180 ? "180°" : lon < 180 ? `${lon}°E` : `${360 - lon}°W`;
        const ox = (lx - cx) / R * 10, oy = (ly - cy) / R * 10, tw = ctx.measureText(tx).width;
        ctx.fillText(tx, Math.min(w - tw - 2, Math.max(2, lx + ox - tw / 2)), Math.min(h - 3, Math.max(10, ly + oy + 4)));
      }
      // Sun and Earth directions: arrows at the edge toward the sub-solar / sub-Earth longitude
      for (const [lon, col, sym] of [[st.subsolar_lon, css("--sun"), "☉"], [st.subearth_lon, css("--earth"), "⊕"]]) {
        const a = lon * Math.PI / 180, x = cx + (R + 8) * Math.sin(a), y = cy - (R + 8) * Math.cos(a);
        ctx.fillStyle = col; ctx.font = "15px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(sym, x, y); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.font = "11px 'IBM Plex Mono', monospace";
      }
    } else {
      proj = (lat, lon) => [((E.norm180(lon) + 180) / 360) * w, ((90 - lat) / 180) * h];
      inv = (x, y) => [90 - (y / h) * 180, (x / w) * 360 - 180];
      shade(ctx, w, h, inv, st, lit, shd, ea, 360 / w);
      ctx.strokeStyle = css("--grid"); ctx.fillStyle = css("--muted");
      for (let lat = -60; lat <= 60; lat += 30) { const y = ((90 - lat) / 180) * h; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); ctx.fillText(`${lat}°`, 2, y - 2); }
      for (let lon = -150; lon <= 150; lon += 30) { const x = ((lon + 180) / 360) * w; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (const [lat, lon, col, sym] of [[st.subsolar_lat, st.subsolar_lon, css("--sun"), "☉"], [st.subearth_lat, st.subearth_lon, css("--earth"), "⊕"]]) {
        const [x, y] = proj(lat, lon); ctx.fillStyle = col; ctx.font = "16px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(sym, x, y); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.font = "11px 'IBM Plex Mono', monospace";
      }
    }
    // sites (labels thinned on small screens)
    const small = w < 460;
    const placed = [];
    for (const s of vis) {
      const [x, y] = proj(s.lat, s.lon);
      if (S.mapMode === "polar" && inv(x, y) === null) continue;
      const sel = s.id === S.siteId;
      ctx.beginPath(); ctx.arc(x, y, sel ? 7 : 5, 0, 2 * Math.PI);
      ctx.fillStyle = statusColor(statusAt(s.id, S.cursor)); ctx.fill();
      ctx.lineWidth = sel ? 2.5 : 1; ctx.strokeStyle = sel ? css("--craft") : css("--bg"); ctx.stroke();
      mapHits.push({ id: s.id, x, y });
      const name = small ? s.name.split(" ")[0] : s.name;
      const free = !placed.some(([px, py]) => Math.abs(px - x) < 60 && Math.abs(py - y) < 12);
      if (sel || (free && (!small || placed.length < 6))) { label(ctx, name, x + 4, y + 4, w, css("--ink")); placed.push([x, y]); }
    }
  }
  function shade(ctx, w, h, inv, st, lit, shd, ea, degPerPx) {
    const N = Math.max(160, Math.min(420, Math.round(w * 0.75))), Mh = Math.round(N * h / w);
    const lineHalf = 1.2 * degPerPx * w / N;  // Earth-on-horizon line ~2 output px wide
    const img = ctx.createImageData(N, Mh), dd = img.data;
    const bg = hexToRgb(css("--panel"));
    for (let j = 0; j < Mh; j++) for (let i = 0; i < N; i++) {
      const ll = inv((i + 0.5) * w / N, (j + 0.5) * h / Mh), o = (j * N + i) * 4;
      if (!ll) { dd[o] = bg[0]; dd[o + 1] = bg[1]; dd[o + 2] = bg[2]; dd[o + 3] = 255; continue; }
      const el = E.sphericalElevation(ll[0], ll[1], st.subsolar_lat, st.subsolar_lon);
      const ee = E.sphericalElevation(ll[0], ll[1], st.subearth_lat, st.subearth_lon);
      const f = Math.max(0, Math.min(1, (el + 0.27) / 0.54));
      let c = [0, 1, 2].map((q) => shd[q] + (lit[q] - shd[q]) * f);
      if (Math.abs(ee) < lineHalf) c = ea;
      dd[o] = c[0]; dd[o + 1] = c[1]; dd[o + 2] = c[2]; dd[o + 3] = 255;
    }
    const off = document.createElement("canvas"); off.width = N; off.height = Mh;
    off.getContext("2d").putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(off, 0, 0, w, h);
  }

  // ------------------------------------------------------------------ site panel
  function renderPanel() {
    const el = $("#sitePanel"), s = siteById(S.siteId);
    if (!s) { el.innerHTML = `<p class="note">${t("loading")}</p>`; return; }
    const csKey = s.coord_status === "user" ? "cs_user" : "cs_" + s.coord_status;
    const coord = s.has_coords ? `${Math.abs(s.lat).toFixed(4)}°${s.lat < 0 ? "S" : "N"}, ${Math.abs(s.lon).toFixed(4)}°${s.lon < 0 ? "W" : "E"}` : "—";
    let html = `<h2 class="site-name">${esc(s.name)}</h2>
      <p class="site-sub">${esc(t("set_" + s.set))} · ${t("p_coords")}: <span class="coord">${coord}</span> (${t(csKey)})${s.source ? ` · ${t("p_source")}: ${esc(s.source.name.split(" - ")[0].split(",")[0])}` : ""}</p>`;
    if (!ready(s)) {
      el.innerHTML = html + `<span class="pill pending">${t("st_pending")}</span><p class="plain">${t("pending_msg")}</p>`;
      return;
    }
    const i = S.cursor, ser = D.series[s.id], e = EV[s.id], ev = e.ev, now = D.times[i];
    const sm = E.summarize(D.times, ev, S.returnHours, now);
    const st = sm.status;
    const until = (ms) => (ms === null ? t("beyond") : fmtDur((ms - now) / HOUR));
    let plain = st === "ideal" ? t("pl_ideal") : st === "sun_only" ? t("pl_sun_only", { why: ev.earth_up[i] ? t("why_no_dsn") : t("why_earth_down") }) : st === "dte_only" ? t("pl_dte_only") : t("pl_dark");
    const sel = ser.sun_el[i];
    if (ev.sun_frac[i] > 0 && sel > 0) {
      const L = 1.8 / Math.tan(sel * Math.PI / 180);
      plain += " " + t("shadow", { el: nf(sel, 2), L: L > 1000 ? nf(L / 1000, 1) + " km" : nf(L, 0) + " m" });
    } else plain += " " + t("shadow_none", { el: nf(sel, 2), hz: nf(ev.hz_sun[i], 2) });
    const kp = (cls, k, v) => `<div class="kpi ${cls}"><span>${t(k)}</span><b>${v}</b></div>`;
    html += `<span class="pill ${st}">${t("st_" + st)}</span> <span class="mono small">${fmtT(now)} UTC</span>
      <p class="plain">${plain}</p><div class="kpis">
      ${kp("sun", "k_sun", `${nf(sel, 2)}° / ${nf(ser.sun_az[i], 0)}°`)}
      ${kp("earth", "k_earth", `${nf(ser.earth_el[i], 2)}° / ${nf(ser.earth_az[i], 0)}°`)}
      ${ev.sun[i] ? kp("sun", "k_sunset", until(sm.next_sunset)) : kp("sun", "k_sunrise", until(sm.next_sunrise))}
      ${ev.earth_up[i] ? kp("earth", "k_earthset", until(sm.next_earthset)) : kp("earth", "k_earthrise", until(sm.next_earthrise))}
      ${kp("ideal", "k_nextideal", sm.next_ideal ? (sm.next_ideal.start <= now ? t("now") : until(sm.next_ideal.start)) + ` · ${fmtDur((sm.next_ideal.end - Math.max(now, sm.next_ideal.start)) / HOUR)}` : t("none_in_period"))}
      ${kp("", "k_night", fmtDur(e.summ.longest_night_hours))}
      ${kp("", "k_nodte", fmtDur(e.summ.longest_no_dte_hours))}
      ${kp("sun", "k_sunpct", nf(e.summ.sun_pct, 0) + "%")}
      ${kp("earth", "k_dtepct", nf(e.summ.dte_pct, 0) + "%")}
      ${kp("ideal", "k_idealpct", nf(e.summ.ideal_pct, 0) + "%")}
      </div>`;
    const act = ev.dsn_active[i];
    html += `<h3>${t("h_dsn")}</h3><p class="small">${act.length ? act.map((k) => `${k[0].toUpperCase() + k.slice(1)} (${nf(D.dsn[k][i], 0)}°)`).join(" · ") : t("no_dsn", { e: S.dsnMin })}</p>`;
    const rw = e.summ.return_windows;
    html += `<h3>${t("h_return", { h: S.returnHours })}</h3>` + (rw.length ? `<ul class="list mono">${rw.slice(0, 5).map((r) =>
      `<li>${t("ret_line", { a: fmtT(r.start, false), b: fmtT(r.latest_start, false), c: r.sunset >= D.times[D.times.length - 1] ? t("beyond") : fmtT(r.sunset, false) })}</li>`).join("")}</ul>` : `<p class="small">${t("no_return", { h: S.returnHours })}</p>`);
    html += `<div class="row-btns"><button class="btn" type="button" id="pinBtn">${t("pin")}</button><button class="btn ghost" type="button" id="copyBtn">${t("copy")}</button></div>`;
    el.innerHTML = html;
    $("#pinBtn").onclick = () => { S.pins.push({ id: s.id, t0: Math.floor(now / DAY) * DAY, m: S.missionDays }); store.set("pins", S.pins); renderPinned(); };
    $("#copyBtn").onclick = async () => { try { await navigator.clipboard.writeText(`${s.lat}, ${s.lon}`); $("#copyBtn").textContent = t("copied"); } catch { /* no clipboard */ } };
  }
  const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ------------------------------------------------------------------ horizon chart
  function renderHorizon() {
    const cv = $("#horizon"), s = siteById(S.siteId);
    const { ctx, w, h } = setup(cv, 230);
    ctx.clearRect(0, 0, w, h);
    if (!ready(s)) return;
    const ser = D.series[s.id], ev = EV[s.id].ev, mask = D.masks[s.id] || null;
    const maxE = Math.max(4, ...ser.sun_el, ...ser.earth_el.filter((x) => x > -5)) + 1;
    const yMax = Math.min(92, Math.ceil(maxE)), yMin = -3;
    const L = 34, R = 8, T = 10, B = 22, pw = w - L - R, ph = h - T - B;
    const X = (az) => L + (az / 360) * pw, Y = (el) => T + (1 - (el - yMin) / (yMax - yMin)) * ph;
    ctx.strokeStyle = css("--grid"); ctx.fillStyle = css("--muted"); ctx.lineWidth = 1;
    const yStep = yMax > 40 ? 15 : yMax > 15 ? 5 : yMax > 8 ? 2 : 1;
    for (let e = Math.ceil(yMin / yStep) * yStep; e <= yMax; e += yStep) { ctx.beginPath(); ctx.moveTo(L, Y(e)); ctx.lineTo(w - R, Y(e)); ctx.stroke(); ctx.fillText(`${e}°`, 2, Y(e) + 4); }
    const dirs = w < 420 ? [[0, "N"], [90, "E"], [180, "S"], [270, "W"], [360, "N"]] : [[0, "N"], [45, "NE"], [90, "E"], [135, "SE"], [180, "S"], [225, "SW"], [270, "W"], [315, "NW"], [360, "N"]];
    for (const [az, n] of dirs) { ctx.beginPath(); ctx.moveTo(X(az), T); ctx.lineTo(X(az), T + ph); ctx.stroke(); const tw = ctx.measureText(n).width; ctx.fillText(n, Math.min(w - tw - 1, Math.max(L, X(az) - tw / 2)), h - 6); }
    // terrain (LOLA mask) filled; effective horizon dashed
    ctx.beginPath(); ctx.moveTo(X(0), Y(yMin));
    for (let a = 0; a <= 360; a += 1) ctx.lineTo(X(a), Y(Math.max(yMin, E.maskAt(mask, a))));
    ctx.lineTo(X(360), Y(yMin)); ctx.closePath(); ctx.fillStyle = css("--dark"); ctx.globalAlpha = 0.7; ctx.fill(); ctx.globalAlpha = 1;
    ctx.setLineDash([4, 3]); ctx.strokeStyle = css("--ink"); ctx.beginPath();
    for (let a = 0; a <= 360; a += 1) { const y = Y(E.effectiveHorizon(a, mask, S.margin, S.height)); a ? ctx.lineTo(X(a), y) : ctx.moveTo(X(a), y); }
    ctx.stroke(); ctx.setLineDash([]);
    if (!mask) label(ctx, S.lang === "pt" ? "sem máscara LOLA: horizonte da esfera" : "no LOLA mask: spherical horizon", L, Y(0) - 4, w, css("--muted"));
    // paths over the period
    const path = (azs, els, col) => {
      ctx.strokeStyle = col; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let k = 0; k < azs.length; k++) {
        const x = X(azs[k]), y = Y(Math.max(yMin - 1, Math.min(yMax + 1, els[k])));
        if (k && Math.abs(azs[k] - azs[k - 1]) < 180) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
    };
    path(ser.earth_az, ser.earth_el, css("--earth"));
    path(ser.sun_az, ser.sun_el, css("--sun"));
    // current positions, discs to scale (Sun 0.2666 deg; Earth ~0.95 deg = atan(6371/384400))
    const pxPerDeg = ph / (yMax - yMin), i = S.cursor;
    for (const [az, el, rdeg, col, nm] of [[ser.earth_az[i], ser.earth_el[i], 0.95, css("--earth"), S.lang === "pt" ? "Terra" : "Earth"], [ser.sun_az[i], ser.sun_el[i], E.SUN_RADIUS_DEG, css("--sun"), S.lang === "pt" ? "Sol" : "Sun"]]) {
      if (el < yMin - 1 || el > yMax + 1) continue;
      const r = Math.max(3, rdeg * pxPerDeg);
      ctx.beginPath(); ctx.arc(X(az), Y(el), r, 0, 2 * Math.PI); ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = css("--bg"); ctx.stroke();
      label(ctx, `${nm} ${nf(el, 2)}°`, X(az) + r, Y(el) - r - 2, w, col);
    }
  }

  // ------------------------------------------------------------------ timeline
  let tlGeom = null;
  function renderTimeline() {
    const cv = $("#timeline"), s = siteById(S.siteId);
    const { ctx, w, h } = setup(cv, 200);
    ctx.clearRect(0, 0, w, h);
    $("#cursorTime").textContent = D ? fmtT(D.times[S.cursor]) + " UTC" : "";
    if (!ready(s)) return;
    const ser = D.series[s.id], e = EV[s.id], ev = e.ev, n = D.times.length;
    ctx.font = "11px 'IBM Plex Mono', monospace";
    const labels = [t("tl_el"), t("tl_sun"), t("tl_dte"), t("tl_ideal"), t("tl_ret")];
    const L = Math.ceil(Math.max(...labels.map((x) => ctx.measureText(x).width))) + 10, R = 6;
    const pw = w - L - R, X = (k) => L + (k / n) * pw;
    tlGeom = { L, pw, n };
    // elevation strip: Sun elevation vs terrain horizon in the Sun's direction
    const eT = 6, eH = 70, lo = Math.min(-2, ...ser.sun_el.map((x, k) => Math.min(x, ev.hz_sun[k]))), hi = Math.max(3, ...ser.sun_el.map((x, k) => Math.max(x, ev.hz_sun[k])));
    const yLo = Math.max(lo, -10), yHi = Math.min(hi, 30), Y = (v) => eT + (1 - (Math.max(yLo, Math.min(yHi, v)) - yLo) / (yHi - yLo)) * eH;
    ctx.strokeStyle = css("--grid"); ctx.beginPath(); ctx.moveTo(L, Y(0)); ctx.lineTo(w - R, Y(0)); ctx.stroke();
    ctx.fillStyle = css("--dark"); ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(X(0), eT + eH);
    for (let k = 0; k < n; k++) ctx.lineTo(X(k), Y(ev.hz_sun[k]));
    ctx.lineTo(X(n), eT + eH); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = css("--sun"); ctx.lineWidth = 1.5; ctx.beginPath();
    for (let k = 0; k < n; k++) (k ? ctx.lineTo(X(k), Y(ser.sun_el[k])) : ctx.moveTo(X(k), Y(ser.sun_el[k])));
    ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = css("--muted"); ctx.fillText(labels[0], 2, eT + 12);
    ctx.fillText(`${nf(yHi, 0)}°`, L + 2, eT + 10); ctx.fillText(`${nf(yLo, 0)}°`, L + 2, eT + eH - 2);
    if (w > 520) label(ctx, `— ${t("tl_hz")}`, w - R - 170, eT + eH - 4, w, css("--muted"));
    // bands
    const rows = [[ev.sun, css("--sun")], [ev.dte, css("--earth")], [ev.ideal, css("--ideal")]];
    let y = eT + eH + 8;
    const bh = 15;
    rows.forEach(([flags, col], r) => {
      ctx.fillStyle = css("--panel2"); ctx.fillRect(L, y, pw, bh);
      ctx.fillStyle = col;
      for (const [a, b] of E.intervals(D.times, flags, D.times[1] - D.times[0])) {
        const ka = (a - D.times[0]) / (D.times[1] - D.times[0]), kb = (b - D.times[0]) / (D.times[1] - D.times[0]);
        ctx.fillRect(X(ka), y, Math.max(1, X(kb) - X(ka)), bh);
      }
      ctx.fillStyle = css("--muted"); ctx.fillText(labels[r + 1], 2, y + 11);
      y += bh + 4;
    });
    ctx.fillStyle = css("--panel2"); ctx.fillRect(L, y, pw, bh);
    const k0 = (ms) => (ms - D.times[0]) / (D.times[1] - D.times[0]);
    for (const r of e.summ.return_windows) {
      ctx.fillStyle = css("--craft"); ctx.globalAlpha = 0.35; ctx.fillRect(X(k0(r.start)), y, X(k0(r.end)) - X(k0(r.start)), bh);
      ctx.globalAlpha = 1; ctx.fillRect(X(k0(r.start)), y, Math.max(2, X(k0(r.latest_start)) - X(k0(r.start))), bh);
    }
    ctx.fillStyle = css("--muted"); ctx.fillText(labels[4], 2, y + 11);
    y += bh + 4;
    // mission highlight (from heatmap / scenario)
    if (S.mission && S.mission.id === s.id) {
      const a = k0(S.mission.t0), b = a + S.mission.m * 24 / stepH();
      ctx.strokeStyle = css("--craft"); ctx.lineWidth = 2; ctx.strokeRect(X(a), eT + eH + 6, X(b) - X(a), y - (eT + eH + 6)); ctx.lineWidth = 1;
    }
    // date axis: fewer labels on narrow screens
    const nDays = Math.round(n * stepH() / 24), maxLabels = Math.max(3, Math.floor(pw / 62));
    const every = [1, 2, 3, 5, 7, 10, 14, 15, 30].find((q) => nDays / q <= maxLabels) || 30;
    ctx.fillStyle = css("--muted");
    for (let d = 0; d <= nDays; d += every) {
      const x = X(d * 24 / stepH()), tx = fmtDay(D.times[0] + d * DAY), tw = ctx.measureText(tx).width;
      ctx.fillRect(x, y, 1, 4);
      ctx.fillText(tx, Math.min(w - R - tw, Math.max(L, x - tw / 2)), y + 15);
    }
    // cursor
    const cx = X(S.cursor + 0.5);
    ctx.strokeStyle = css("--ink"); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx, 2); ctx.lineTo(cx, y + 2); ctx.stroke(); ctx.lineWidth = 1;
  }
  function cursorFromEvent(ev) {
    if (!tlGeom || !D) return;
    const r = $("#timeline").getBoundingClientRect(), x = ev.clientX - r.left;
    const k = Math.floor(((x - tlGeom.L) / tlGeom.pw) * tlGeom.n);
    setCursor(Math.max(0, Math.min(D.times.length - 1, k)));
  }

  // ------------------------------------------------------------------ heatmap
  let heatGeom = null;
  function renderHeat() {
    const cv = $("#heat"), rows = visibleSites().filter(ready);
    const rh = 18, { ctx, w, h } = setup(cv, Math.max(40, rows.length * rh + 26));
    ctx.clearRect(0, 0, w, h);
    if (!rows.length || !D) return;
    ctx.font = "11px 'IBM Plex Mono', monospace";
    const nDays = Math.round(D.times.length * stepH() / 24);
    const small = w < 460;
    const names = rows.map((s) => (small ? s.name.split(" ")[0] : s.name).slice(0, 22));
    const L = Math.ceil(Math.max(...names.map((x) => ctx.measureText(x).width))) + 8, cw = (w - L - 4) / nDays;
    const ideal = hexToRgb(css("--ideal")), base = hexToRgb(css("--panel2"));
    heatGeom = { L, cw, rh, rows, nDays };
    rows.forEach((s, r) => {
      ctx.fillStyle = s.id === S.siteId ? css("--craft") : css("--ink"); ctx.fillText(names[r], 2, r * rh + 13);
      for (let d = 0; d < nDays; d++) {
        const ws = windowStats(s.id, D.times[0] + d * DAY, S.missionDays), x = L + d * cw;
        if (!ws) { ctx.fillStyle = css("--grid"); ctx.fillRect(x + 0.5, r * rh + 1, Math.max(1, cw - 1), rh - 2); continue; }
        const f = ws.frac, c = [0, 1, 2].map((q) => Math.round(base[q] + (ideal[q] - base[q]) * f));
        ctx.fillStyle = `rgb(${c})`; ctx.fillRect(x + 0.5, r * rh + 1, Math.max(1, cw - 1), rh - 2);
      }
    });
    if (S.mission) {
      const r = rows.findIndex((s) => s.id === S.mission.id), d = Math.round((S.mission.t0 - D.times[0]) / DAY);
      if (r >= 0 && d >= 0 && d < nDays) { ctx.strokeStyle = css("--craft"); ctx.lineWidth = 2; ctx.strokeRect(L + d * cw, r * rh, cw, rh); ctx.lineWidth = 1; }
    }
    const every = [1, 2, 5, 7, 10, 15, 30].find((q) => nDays / q <= Math.max(3, Math.floor((w - L) / 60))) || 30;
    ctx.fillStyle = css("--muted");
    for (let d = 0; d < nDays; d += every) { const tx = fmtDay(D.times[0] + d * DAY), tw = ctx.measureText(tx).width; ctx.fillText(tx, Math.min(w - tw - 2, L + d * cw), rows.length * rh + 16); }
  }
  function heatFromEvent(ev, click) {
    if (!heatGeom || !D) return;
    const r = $("#heat").getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    const d = Math.floor((x - heatGeom.L) / heatGeom.cw), row = Math.floor(y / heatGeom.rh);
    if (d < 0 || d >= heatGeom.nDays || row < 0 || row >= heatGeom.rows.length) return;
    const s = heatGeom.rows[row], t0 = D.times[0] + d * DAY, ws = windowStats(s.id, t0, S.missionDays);
    $("#heatInfo").textContent = ws ? t("heat_info", { s: s.name, d: fmtDay(t0), p: nf(ws.frac * 100, 0), m: S.missionDays }) : `${s.name} · ${fmtDay(t0)}: ${t("heat_na")}`;
    if (click) { S.siteId = s.id; S.mission = { id: s.id, t0, m: S.missionDays }; S.cursor = Math.round((t0 - D.times[0]) / HOUR / stepH()); writeURL(); renderAll(); }
  }

  // ------------------------------------------------------------------ comparison table
  const COLS = [["name", "cm_site"], ["set", "cm_set"], ["sun_pct", "cm_sun"], ["dte_pct", "cm_dte"], ["ideal_pct", "cm_ideal"],
                ["longest_night_hours", "cm_night"], ["longest_no_dte_hours", "cm_nodte"], ["nret", "cm_ret"], ["now", "cm_now"]];
  function renderCompare() {
    const tb = $("#compare"), rows = visibleSites().map((s) => {
      const e = EV[s.id];
      return { s, name: s.name, set: t("set_" + s.set), ...(e ? e.summ : {}), nret: e ? e.summ.return_windows.length : null, now: e ? statusAt(s.id, S.cursor) : null };
    });
    const { key, asc } = S.sort;
    rows.sort((a, b) => {
      if (!EV[a.s.id] !== !EV[b.s.id]) return EV[a.s.id] ? -1 : 1;
      const va = a[key], vb = b[key];
      return (typeof va === "string" ? va.localeCompare(vb) : (va ?? -1) - (vb ?? -1)) * (asc ? 1 : -1);
    });
    tb.innerHTML = `<thead><tr>${COLS.map(([k, l]) => `<th data-k="${k}" class="${k === key ? "sorted" + (asc ? " asc" : "") : ""}">${t(l)}</th>`).join("")}</tr></thead><tbody>` +
      rows.map((r) => {
        if (!EV[r.s.id]) return `<tr class="pending" data-id="${r.s.id}"><td>${esc(r.name)}</td><td>${r.set}</td><td colspan="7">${t("st_pending")}</td></tr>`;
        return `<tr data-id="${r.s.id}" class="${r.s.id === S.siteId ? "sel" : ""}"><td>${esc(r.name)}</td><td>${r.set}</td>
          <td class="num">${nf(r.sun_pct, 0)}</td><td class="num">${nf(r.dte_pct, 0)}</td><td class="num">${nf(r.ideal_pct, 0)}</td>
          <td class="num">${nf(r.longest_night_hours, 0)}</td><td class="num">${nf(r.longest_no_dte_hours, 0)}</td><td class="num">${r.nret}</td>
          <td><span class="pill ${r.now}">${t("st_" + r.now)}</span></td></tr>`;
      }).join("") + "</tbody>";
    tb.querySelectorAll("th").forEach((th) => (th.onclick = () => { const k = th.dataset.k; S.sort = { key: k, asc: S.sort.key === k ? !S.sort.asc : k === "name" || k === "set" || k.startsWith("longest") }; renderCompare(); }));
    tb.querySelectorAll("tbody tr").forEach((tr) => (tr.onclick = () => selectSite(tr.dataset.id)));
  }

  // ------------------------------------------------------------------ pinned scenarios
  function renderPinned() {
    const tb = $("#pinned");
    if (!S.pins.length) { tb.innerHTML = `<tbody><tr><td class="note">${t("pn_empty")}</td></tr></tbody>`; return; }
    const rows = S.pins.map((p, k) => ({ p, k, s: siteById(p.id), ws: D ? windowStats(p.id, p.t0, p.m) : null }));
    const cols = [["sun", "pn_sun", 1], ["dte", "pn_dte", 1], ["ideal", "pn_ideal", 1], ["dark", "pn_dark", -1], ["el", "pn_el", 1]];
    const best = {};
    for (const [c, , dir] of cols) { const v = rows.filter((r) => r.ws).map((r) => r.ws[c]); if (v.length > 1) best[c] = dir > 0 ? Math.max(...v) : Math.min(...v); }
    tb.innerHTML = `<thead><tr><th>${t("pn_site")}</th><th>${t("pn_land")}</th>${cols.map(([, l]) => `<th>${t(l)}</th>`).join("")}<th></th></tr></thead><tbody>` +
      rows.map(({ p, k, s, ws }) => `<tr data-k="${k}"><td>${esc(s ? s.name : p.id)}</td><td class="mono">${fmtT(p.t0)} · ${nf(p.m, 1)} d</td>` +
        (ws ? cols.map(([c]) => `<td class="num ${best[c] !== undefined && Math.abs(ws[c] - best[c]) < 1e-9 ? "best" : ""}">${nf(ws[c], c === "el" ? 2 : 0)}${c === "el" ? "°" : ""}</td>`).join("")
            : `<td colspan="${cols.length}" class="note">${t("pn_out")}</td>`) +
        `<td><button class="x" type="button" aria-label="remove" data-rm="${k}">×</button></td></tr>`).join("") + "</tbody>";
    tb.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); S.pins.splice(+b.dataset.rm, 1); store.set("pins", S.pins); renderPinned(); }));
    tb.querySelectorAll("tbody tr").forEach((tr) => (tr.onclick = () => {
      const p = S.pins[+tr.dataset.k]; if (!p || !D) return;
      const k = Math.round((p.t0 - D.times[0]) / HOUR / stepH());
      if (k >= 0 && k < D.times.length) { S.siteId = p.id; S.cursor = k; S.mission = { id: p.id, t0: p.t0, m: p.m }; writeURL(); renderAll(); }
    }));
  }

  // ------------------------------------------------------------------ scenarios
  function scnBox(html) { const b = $("#scnSummary"); b.hidden = false; b.innerHTML = html; }
  const kpi = (lbl, val, cls = "") => `<div class="scn-kpi ${cls}"><span class="small">${lbl}</span><b>${val}</b></div>`;
  let lastScn = null;
  function runScenario(name) {
    lastScn = name;
    $$(".btn.scn").forEach((b) => b.classList.toggle("on", b.dataset.scn === name));
    if (!D) return;
    if (name === "farside") {
      S.set = "all"; $("#cSet").value = "all";
      const s = siteById("ce6"); if (!ready(s)) return;
      S.siteId = "ce6"; S.cursor = 0; S.mission = null;
      const sm = EV.ce6.summ;
      scnBox(`<h3>${t("s3_title")}</h3><p>${t("s3_body", { s: esc(s.name), sun: nf(sm.sun_pct, 0), dte: nf(sm.dte_hours, 0) })}</p>
        <div class="scn-kpis">${kpi(t("s3_k0"), nf(sm.sun_pct, 0) + "%", "good")}${kpi(t("s3_k1"), nf(sm.dte_hours, 0) + " h", "bad")}${kpi(t("s3_k2"), fmtDur(sm.longest_night_hours))}</div>`);
    } else if (name === "delay") {
      const a = siteById("a3-malapert-massif"), b = siteById("a3-mons-mouton");
      if (!ready(a) || !ready(b)) { scnBox(`<h3>${t("s1_title")}</h3><p>${t("pending_scn", { s: [a, b].filter((x) => !ready(x)).map((x) => esc(x ? x.name : "?")).join(", ") })}</p>`); return; }
      const m = S.missionDays, nDays = Math.round(D.times.length * stepH() / 24);
      let bestD = 0, bestDrop = -Infinity;
      for (let d = 0; d + 5 + m <= nDays; d++) {
        const w0 = windowStats(a.id, D.times[0] + d * DAY, m), w1 = windowStats(a.id, D.times[0] + (d + 5) * DAY, m);
        if (w0 && w1 && w0.frac - w1.frac > bestDrop) { bestDrop = w0.frac - w1.frac; bestD = d; }
      }
      const t0 = D.times[0] + bestD * DAY, t1 = t0 + 5 * DAY;
      const w0 = windowStats(a.id, t0, m), w1 = windowStats(a.id, t1, m), w2 = windowStats(b.id, t1, m);
      if (!w0 || !w1 || !w2) { scnBox(`<h3>${t("s1_title")}</h3><p>${t("heat_na")}</p>`); return; }
      S.pins = [{ id: a.id, t0, m }, { id: a.id, t0: t1, m }, { id: b.id, t0: t1, m }]; store.set("pins", S.pins);
      S.siteId = a.id; S.cursor = Math.round((t1 - D.times[0]) / HOUR / stepH()); S.mission = { id: a.id, t0: t1, m };
      scnBox(`<h3>${t("s1_title")}</h3><p>${t("s1_body", { a: esc(a.name), d0: fmtT(t0), d1: fmtT(t1), m })}</p>
        <div class="scn-kpis">${kpi(t("s1_k0", { a: esc(a.name) }), nf(w0.frac * 100, 0) + "%", "good")}${kpi(t("s1_k1", { a: esc(a.name) }), nf(w1.frac * 100, 0) + "%", w1.frac < w0.frac ? "bad" : "")}${kpi(t("s1_k2", { b: esc(b.name) }), nf(w2.frac * 100, 0) + "%", w2.frac > w1.frac ? "good" : "")}</div><p>${t("s1_end")}</p>`);
    } else if (name === "contrast") {
      const pair = allSites().filter((s) => s.pair && ready(s));
      if (pair.length < 2) { scnBox(`<h3>${t("s2_title")}</h3><p>${t("pair_wait")}</p>`); return; }
      S.siteId = pair[0].id; S.cursor = 0; S.mission = null;
      scnBox(`<h3>${t("s2_title")}</h3>` + pairHTML(pair));
    }
    writeURL(); renderAll();
    $("#scnSummary").scrollIntoView({ block: "nearest" });
  }
  function pairHTML(pair) {
    return `<div class="scn-kpis">${pair.map((s) => { const sm = EV[s.id].summ; return kpi(esc(s.name), `${nf(sm.sun_pct, 0)}% · ${fmtDur(sm.longest_night_hours)} · DTE ${nf(sm.dte_pct, 0)}%`); }).join("")}</div>`;
  }
  function renderPair() {
    const pair = allSites().filter((s) => s.pair && ready(s));
    $("#pairBox").innerHTML = pair.length >= 2 ? pairHTML(pair) : `<p class="note">${t("pair_wait")}</p>`;
  }

  // ------------------------------------------------------------------ render all / i18n
  function applyI18n() {
    document.documentElement.lang = S.lang === "pt" ? "pt-BR" : "en";
    $$("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
    $$("[data-i18n-html]").forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml)));
    $("#langBtn").textContent = S.lang === "pt" ? "EN" : "PT";
  }
  function renderAll() {
    if (!D) return;
    setBadge(D);
    $("#cStart").value = isoDate(S.start); $("#cDays").value = String(S.days);
    renderMap(); renderPanel(); renderHorizon(); renderTimeline(); renderHeat(); renderCompare(); renderPinned(); renderPair();
  }
  let raf = 0;
  function setCursor(k) {
    S.cursor = k;
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; renderMap(); renderPanel(); renderHorizon(); renderTimeline(); renderCompare(); });
  }
  function selectSite(id) { S.siteId = id; writeURL(); renderAll(); }

  function toCSV() {
    const s = siteById(S.siteId); if (!ready(s)) return;
    const e = EV[s.id], iso = (ms) => new Date(ms).toISOString().slice(0, 16) + "Z", src = D.source;
    const lines = [["site", "type", "start_utc", "end_utc", "hours", "source"].join(",")];
    for (const k of ["sun", "dte", "ideal"]) for (const [a, b] of e.summ.intervals[k]) lines.push([s.id, k, iso(a), iso(b), ((b - a) / HOUR).toFixed(1), src].join(","));
    for (const r of e.summ.return_windows) lines.push([s.id, `return_${S.returnHours}h`, iso(r.start), iso(r.latest_start), r.hours.toFixed(1), src].join(","));
    const blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv" }), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `janela-polar_${s.id}_${isoDate(S.start)}_${S.days}d.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ------------------------------------------------------------------ events
  function bind() {
    $("#langBtn").onclick = () => { S.lang = S.lang === "pt" ? "en" : "pt"; store.set("lang", S.lang); applyI18n(); writeURL(); if (lastScn) runScenario(lastScn); else renderAll(); };
    $("#themeBtn").onclick = () => { S.theme = S.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = S.theme; store.set("theme", S.theme); renderAll(); };
    $("#cSet").onchange = (e) => { S.set = e.target.value; if (!visibleSites().some((s) => s.id === S.siteId)) S.siteId = (visibleSites().find(ready) || visibleSites()[0] || {}).id || S.siteId; writeURL(); renderAll(); };
    $("#cStart").onchange = (e) => { const v = Date.parse(e.target.value + "T00:00:00Z"); if (!Number.isNaN(v)) { S.start = v; S.cursor = 0; S.mission = null; writeURL(); load(); } };
    $("#cDays").onchange = (e) => { S.days = +e.target.value; writeURL(); load(); };
    const live = (id, out, key, fmt) => { const el = $(id); el.value = S[key]; $(out).textContent = fmt(S[key]);
      el.oninput = () => { S[key] = +el.value; $(out).textContent = fmt(S[key]); compute(); renderAll(); }; };
    live("#cMargin", "#oMargin", "margin", (v) => v.toFixed(1) + "°");
    live("#cHeight", "#oHeight", "height", (v) => v + " m");
    live("#cDsn", "#oDsn", "dsnMin", (v) => v + "°");
    $("#cReturn").onchange = (e) => { S.returnHours = +e.target.value; compute(); renderAll(); };
    $("#cMission").onchange = (e) => { S.missionDays = +e.target.value; S.mission = null; renderHeat(); renderTimeline(); };
    $$(".seg-btn").forEach((b) => (b.onclick = () => { S.mapMode = b.dataset.map; $$(".seg-btn").forEach((x) => x.classList.toggle("on", x === b)); renderMap(); }));
    $("#map").addEventListener("click", (ev) => {
      const r = $("#map").getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
      let best = null, bd = 14;
      for (const h of mapHits) { const d = Math.hypot(h.x - x, h.y - y); if (d < bd) { bd = d; best = h; } }
      if (best) selectSite(best.id);
    });
    const tl = $("#timeline"); let drag = false;
    tl.addEventListener("pointerdown", (e) => { drag = true; tl.setPointerCapture(e.pointerId); cursorFromEvent(e); });
    tl.addEventListener("pointermove", (e) => { if (drag) cursorFromEvent(e); });
    tl.addEventListener("pointerup", () => (drag = false));
    $("#heat").addEventListener("mousemove", (e) => heatFromEvent(e, false));
    $("#heat").addEventListener("click", (e) => heatFromEvent(e, true));
    $("#playBtn").onclick = () => {
      S.playing = !S.playing; $("#playBtn").textContent = S.playing ? "❚❚" : "▶";
      const tick = () => { if (!S.playing || !D) return; setCursor((S.cursor + Math.max(1, Math.round(D.times.length / 500))) % D.times.length); setTimeout(() => requestAnimationFrame(tick), 40); };
      tick();
    };
    $("#csvBtn").onclick = toCSV;
    $$(".btn.scn").forEach((b) => (b.onclick = () => runScenario(b.dataset.scn)));
    $("#pointForm").onsubmit = (e) => {
      e.preventDefault();
      const lat = parseFloat($("#pLat").value), lon0 = parseFloat($("#pLon").value);
      if (!(lat >= -90 && lat <= 90) || !(lon0 >= -180 && lon0 <= 360)) { $("#pMsg").textContent = t("pt_bad"); return; }
      const lon = ((lon0 + 180) % 360 + 360) % 360 - 180, name = ($("#pName").value || "").trim() || `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
      const id = "my-" + Date.now().toString(36);
      S.mine.push({ id, name, lat, lon }); store.set("mine", S.mine);
      $("#pMsg").textContent = t("pt_ok", { n: name }); S.siteId = id; if (S.set !== "all") { S.set = "mine"; $("#cSet").value = "mine"; }
      load();
    };
    let rz = 0;
    window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => renderAll(), 120); });
  }

  // ------------------------------------------------------------------ init
  readURL();
  document.documentElement.dataset.theme = S.theme;
  applyI18n();
  bind();
  load();
  window.JP = { S, get D() { return D; }, get EV() { return EV; }, runScenario }; // for tests / debugging
})();
