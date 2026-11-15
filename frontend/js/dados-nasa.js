/* Dados da NASA - one card per resource (what it is, how the app uses it), per-site links, CSA section.
 * QuickMap / Moon Trek: the URL format for centring on a coordinate could NOT be confirmed in a browser
 * during the event, so the app opens each tool's home page and offers the coordinate to copy (per the brief).
 */
(() => {
  "use strict";
  const E = window.JPEngine, $ = (s) => document.querySelector(s), $$ = (s) => Array.from(document.querySelectorAll(s));
  const store = { get(k, d) { try { const v = localStorage.getItem("jp_" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
                  set(k, v) { try { localStorage.setItem("jp_" + k, JSON.stringify(v)); } catch { /* ignore */ } } };
  const q = new URLSearchParams(location.search);
  const S = { lang: q.get("lang") === "pt" || q.get("lang") === "en" ? q.get("lang") : store.get("lang", "en"), theme: store.get("theme", "dark") };
  document.documentElement.dataset.theme = S.theme;
  const URLS = {
    horizons: "https://ssd.jpl.nasa.gov/horizons/", quickmap: "https://quickmap.lroc.asu.edu/", trek: "https://trek.nasa.gov/moon/",
    pgda90: "https://pgda.gsfc.nasa.gov/products/90", pgda78: "https://pgda.gsfc.nasa.gov/products/78", pgda69: "https://pgda.gsfc.nasa.gov/products/69",
    usgs: "https://www.sciencebase.gov/catalog/item/671a6fa8d34efed5620f89f8", nssdc: "https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html",
    csa: "https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/canada-role/",
  };
  const T = {
    en: {
      tagline: "Sun & Earth windows for lunar landing sites", nav_polar: "Polar Window", nav_trip: "Earth to Moon", nav_data: "NASA Data",
      title: "Data behind the app", lead: "Every number in Janela Polar comes from one of these resources. Each card says what the resource is and exactly how the app uses it.",
      what: "What it is", how: "How the app uses it", open: "Open", persite: "Per-site links",
      persite_note: "Horizons: the official table for the Sun as seen from the site, next 30 days, hourly, airless (same parameters the app uses). QuickMap and Moon Trek: we could not confirm in a browser how to open them centred on a coordinate, so the buttons open the tool and copy the coordinate for you to paste in its search box.",
      c_site: "Site", c_coord: "Coordinates (lat, lon E)", c_hz: "JPL Horizons", c_qm: "LROC QuickMap", c_mt: "Moon Trek", sun_table: "Sun table", earth_table: "Earth table", copy_open: "Copy + open", copied: "Copied",
      foot: "Janela Polar is a NASA Space Apps Challenge 2026 project, not an official NASA product. No NASA logos are used.",
      res: [
        ["JPL Horizons", "NASA/JPL Solar System Dynamics", "horizons",
          "Official ephemeris service: positions of the Sun, Earth and Moon for any observer, including a point on the lunar surface.",
          "Primary source. The backend asks for the Sun's and Earth's azimuth/elevation from each site (airless, hourly) and the Moon's elevation from the DSN complexes; GitHub Actions does the same daily for the precomputed bundle. Our analytic fallback was checked against it: max difference 0.035°."],
        ["LOLA DEMs (PGDA product 90)", "NASA GSFC, Barker et al. 2023", "pgda90",
          "Laser-altimeter terrain maps of the lunar south pole: 80 m/px (80–90°S) and 240 m/px (60–90°S).",
          "Terrain horizon of every polar site: rays every 1° up to 150 km. This is what makes a ridge and a hollow 3.5 km apart behave so differently."],
        ["LOLA site DEMs (PGDA product 78)", "NASA GSFC, Barker et al. 2021", "pgda78",
          "5 m/px terrain for selected south-pole sites, with error maps.",
          "Reference for future work (too local for 150 km horizons); not used in the calculations."],
        ["Lunar polar illumination (PGDA product 69)", "NASA GSFC, Mazarico et al. 2011", "pgda69",
          "Long-term average illumination and permanently shadowed regions from LOLA topography.",
          "Context and a cross-check reference; the app computes its own time-resolved illumination."],
        ["Artemis III candidate regions (USGS)", "McClernan 2024, doi:10.5066/P1MEQ6UK; regions from LROC QuickMap", "usgs",
          "Official navigation grids of the nine candidate landing regions announced by NASA in October 2024.",
          "Region centres (8 of 9 loaded): mean of the 1 km grid cells, converted from the USGS polar stereographic projection and cross-checked against the metadata."],
        ["LROC QuickMap", "LRO Camera team, Arizona State University", "quickmap",
          "Interactive map of LRO imagery and data products; source of the Artemis III region outlines.",
          "Per-site button to open the tool with the coordinate copied (centring URL not confirmed)."],
        ["Moon Trek", "NASA Solar System Treks (JPL / SSERVI)", "trek",
          "Browser portal to explore lunar data layers in 2D and 3D, built for mission planning and outreach.",
          "Per-site button to open the tool with the coordinate copied (centring URL not confirmed)."],
        ["Lander and Apollo positions (NSSDC)", "NASA Space Science Data Coordinated Archive", "nssdc",
          "Table of spacecraft and impact sites on the Moon (checked 2026-11-14, page updated 2025-08-13).",
          "Coordinates of IM-1, IM-2, Chandrayaan-3, Blue Ghost 1, SLIM, Chang'e 4/6 and the Apollo 11/15/17 lunar modules."],
      ],
      csa_title: "Space Agency Partner: Canadian Space Agency (CSA)",
      csa_body: [
        "<b>Canadarm3.</b> Canada's robotic system designed for Gateway, the small station planned to orbit the Moon. In 2026 NASA paused Gateway in its current form, shortly before Artemis II; CSA says it is ready to adapt as Artemis evolves.",
        "<b>Lunar utility vehicle.</b> A Canadian rover to support astronauts on the surface; funding was kept in 2026–27 with a flight expected in 2033.",
        "<b>LEAP.</b> The Lunar Exploration Accelerator Program funds Canadian science and technology in lunar orbit and on the surface.",
        "<b>Jeremy Hansen.</b> CSA astronaut, first non-American on a crewed Moon mission: Artemis II launched on 1 April 2026 from Kennedy's Launch Complex 39B.",
        "<b>Why it matters here.</b> A surface rover near the south pole lives by the same Sun and Earth windows this app computes: battery nights and DTE gaps decide where and when it can drive.",
      ],
      csa_src: "Sources: CSA Moon exploration portal; SpaceQ (April 2026) for the Artemis II launch and the Gateway pause.",
    },
    pt: {
      tagline: "Janelas de Sol e Terra para locais de pouso na Lua", nav_polar: "Janela Polar", nav_trip: "Da Terra à Lua", nav_data: "Dados da NASA",
      title: "Os dados por trás do app", lead: "Todo número da Janela Polar vem de um destes recursos. Cada quadro diz o que é o recurso e exatamente como o app o usa.",
      what: "O que é", how: "Como o app usa", open: "Abrir", persite: "Links por local",
      persite_note: "Horizons: a tabela oficial do Sol visto do local, próximos 30 dias, de hora em hora, sem atmosfera (os mesmos parâmetros do app). QuickMap e Moon Trek: não conseguimos confirmar num navegador como abri-los centrados numa coordenada, então os botões abrem a ferramenta e copiam a coordenada para você colar na busca dela.",
      c_site: "Local", c_coord: "Coordenadas (lat, lon L)", c_hz: "JPL Horizons", c_qm: "LROC QuickMap", c_mt: "Moon Trek", sun_table: "Tabela do Sol", earth_table: "Tabela da Terra", copy_open: "Copiar + abrir", copied: "Copiado",
      foot: "Janela Polar é um projeto do NASA Space Apps Challenge 2026, não um produto oficial da NASA. Não usamos logotipos da NASA.",
      res: [
        ["JPL Horizons", "NASA/JPL Solar System Dynamics", "horizons",
          "Serviço oficial de efemérides: posições do Sol, da Terra e da Lua para qualquer observador, inclusive um ponto na superfície lunar.",
          "Fonte principal. O backend pede o azimute e a elevação do Sol e da Terra em cada local (sem atmosfera, de hora em hora) e a elevação da Lua nas antenas da DSN; o GitHub Actions faz o mesmo todo dia para o pacote pré-calculado. Nosso modelo de reserva foi comparado com ela: diferença máxima de 0,035°."],
        ["DEMs LOLA (PGDA produto 90)", "NASA GSFC, Barker et al. 2023", "pgda90",
          "Mapas de relevo por altímetro laser do polo sul lunar: 80 m/px (80–90°S) e 240 m/px (60–90°S).",
          "Horizonte do relevo de cada local polar: raios a cada 1° até 150 km. É isso que faz uma crista e uma depressão a 3,5 km se comportarem de forma tão diferente."],
        ["DEMs LOLA de locais (PGDA produto 78)", "NASA GSFC, Barker et al. 2021", "pgda78",
          "Relevo de 5 m/px de locais selecionados do polo sul, com mapas de erro.",
          "Referência para trabalhos futuros (local demais para horizontes de 150 km); não usado nos cálculos."],
        ["Iluminação polar lunar (PGDA produto 69)", "NASA GSFC, Mazarico et al. 2011", "pgda69",
          "Iluminação média de longo prazo e regiões permanentemente sombreadas a partir do relevo LOLA.",
          "Contexto e referência de comparação; o app calcula sua própria iluminação hora a hora."],
        ["Regiões candidatas da Artemis III (USGS)", "McClernan 2024, doi:10.5066/P1MEQ6UK; regiões do LROC QuickMap", "usgs",
          "Grades oficiais de navegação das nove regiões candidatas anunciadas pela NASA em outubro de 2024.",
          "Centro das regiões (8 de 9 carregadas): média das células da grade de 1 km, convertidas da projeção estereográfica polar do USGS e conferidas com os metadados."],
        ["LROC QuickMap", "Equipe da câmera do LRO, Arizona State University", "quickmap",
          "Mapa interativo das imagens e produtos do LRO; fonte dos contornos das regiões da Artemis III.",
          "Botão por local que abre a ferramenta com a coordenada copiada (URL de centralização não confirmada)."],
        ["Moon Trek", "NASA Solar System Treks (JPL / SSERVI)", "trek",
          "Portal no navegador para explorar camadas de dados lunares em 2D e 3D, feito para planejamento de missões e divulgação.",
          "Botão por local que abre a ferramenta com a coordenada copiada (URL de centralização não confirmada)."],
        ["Posição dos pousos e das Apollo (NSSDC)", "NASA Space Science Data Coordinated Archive", "nssdc",
          "Tabela de naves e locais de impacto na Lua (conferida em 14/11/2026, página atualizada em 13/08/2025).",
          "Coordenadas de IM-1, IM-2, Chandrayaan-3, Blue Ghost 1, SLIM, Chang'e 4/6 e dos módulos lunares das Apollo 11/15/17."],
      ],
      csa_title: "Agência parceira: Agência Espacial Canadense (CSA)",
      csa_body: [
        "<b>Canadarm3.</b> Sistema robótico canadense projetado para a Gateway, a pequena estação planejada para orbitar a Lua. Em 2026 a NASA pausou a Gateway na forma atual, pouco antes da Artemis II; a CSA diz estar pronta para se adaptar à evolução do programa Artemis.",
        "<b>Veículo utilitário lunar.</b> Um rover canadense para apoiar astronautas na superfície; o financiamento foi mantido em 2026–27, com voo previsto para 2033.",
        "<b>LEAP.</b> O Programa de Aceleração da Exploração Lunar financia ciência e tecnologia canadenses em órbita lunar e na superfície.",
        "<b>Jeremy Hansen.</b> Astronauta da CSA, primeiro não americano numa missão tripulada à Lua: a Artemis II decolou em 1º de abril de 2026 do Complexo de Lançamento 39B do Kennedy.",
        "<b>Por que importa aqui.</b> Um rover perto do polo sul vive das mesmas janelas de Sol e Terra que este app calcula: as noites de bateria e as falhas de DTE decidem onde e quando ele pode andar.",
      ],
      csa_src: "Fontes: portal de exploração lunar da CSA; SpaceQ (abril de 2026) para o lançamento da Artemis II e a pausa da Gateway.",
    },
  };
  const t = (k) => T[S.lang][k] ?? k;
  const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ext = (href, label) => `<a class="ext" href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;

  function render() {
    document.documentElement.lang = S.lang === "pt" ? "pt-BR" : "en";
    $$("[data-t]").forEach((el) => (el.textContent = t(el.dataset.t)));
    $("#langBtn").textContent = S.lang === "pt" ? "EN" : "PT";
    $("#resources").innerHTML = t("res").map(([name, who, key, what, how]) => `<article class="res kpi">
      <h3>${esc(name)}</h3><p class="who">${esc(who)}</p>
      <dl><dt>${t("what")}</dt><dd>${esc(what)}</dd><dt>${t("how")}</dt><dd>${esc(how)}</dd></dl>
      <p>${ext(URLS[key], t("open"))}</p></article>`).join("");
    const now = new Date(), t0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()), t1 = t0 + 30 * 86400000;
    const sites = ((window.JP_SITES_STATIC || {}).sites || []).filter((s) => s.has_coords);
    $("#siteLinks").innerHTML = `<thead><tr><th>${t("c_site")}</th><th>${t("c_coord")}</th><th>${t("c_hz")}</th><th>${t("c_qm")}</th><th>${t("c_mt")}</th></tr></thead><tbody>` +
      sites.map((s) => { const c = `${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}`;
        return `<tr><td>${esc(s.name)}</td><td class="mono">${c}</td>
          <td>${ext(E.horizonsURL("10", "301", s.lat, s.lon, t0, t1), t("sun_table"))} · ${ext(E.horizonsURL("399", "301", s.lat, s.lon, t0, t1), t("earth_table"))}</td>
          <td><button class="btn ghost" type="button" data-copy="${c}" data-go="${URLS.quickmap}">${t("copy_open")}</button></td>
          <td><button class="btn ghost" type="button" data-copy="${c}" data-go="${URLS.trek}">${t("copy_open")}</button></td></tr>`; }).join("") + "</tbody>";
    $("#siteLinks").querySelectorAll("[data-copy]").forEach((b) => (b.onclick = async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = t("copied"); } catch { /* clipboard blocked: coordinate stays visible */ }
      window.open(b.dataset.go, "_blank", "noopener");
    }));
    $("#csa").innerHTML = `<h2>${t("csa_title")}</h2><div class="why-grid">${t("csa_body").map((p) => `<div>${p}</div>`).join("")}</div>
      <p class="note">${t("csa_src")} ${ext(URLS.csa, "asc-csa.gc.ca")}</p>`;
  }
  let VAL = null;
  function renderValidation() {
    const el = $("#validation");
    const title = S.lang === "pt" ? "Validação: modelo analítico × JPL Horizons" : "Validation: analytic model vs JPL Horizons";
    const note = S.lang === "pt"
      ? "Diferença máxima em graus, 24 amostras por célula, sem relevo nos dois lados. Recalculado a cada publicação do site pelo GitHub Actions. Tolerância: 0,35°."
      : "Maximum difference in degrees, 24 hourly samples per cell, no terrain on either side. Recomputed by GitHub Actions on every deployment. Tolerance: 0.35°.";
    if (!VAL) { el.innerHTML = `<h2>${title}</h2><p class="note">${note}</p><p class="note">${S.lang === "pt" ? "Tabela disponível no site publicado e no README." : "Table available on the published site and in the README."}</p>`; return; }
    const f = (x) => (x === null ? "—" : x.toFixed(3) + "°");
    el.innerHTML = `<h2>${title}</h2><p class="note">${note} ${VAL.generated_utc} · worst ${f(VAL.worst_deg)}</p>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Site</th><th>Date</th><th class="num">Sun Δel</th><th class="num">Sun Δaz·cos el</th><th class="num">Earth Δel</th><th class="num">Earth Δaz·cos el</th></tr></thead><tbody>
      ${VAL.rows.map((r) => `<tr><td>${esc(r.name)}</td><td class="mono">${r.date}</td><td class="num">${f(r.sun_del_max)}</td><td class="num">${f(r.sun_daz_max)}</td><td class="num">${f(r.earth_del_max)}</td><td class="num">${f(r.earth_daz_max)}</td></tr>`).join("")}
      </tbody></table></div>`;
  }
  if (/^https?:$/.test(location.protocol)) fetch("data/validation.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((j) => { VAL = j; renderValidation(); }).catch(() => {});
  $("#langBtn").onclick = () => { S.lang = S.lang === "pt" ? "en" : "pt"; store.set("lang", S.lang); render(); renderValidation(); };
  $("#themeBtn").onclick = () => { S.theme = S.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = S.theme; store.set("theme", S.theme); };
  render();
  renderValidation();
})();
