const DATA_URL = "data/inscripcions.json";

const MESOS_KEYS = [
  "gener", "febrer", "marc", "abril", "maig", "juny",
  "juliol", "agost", "setembre", "octubre", "novembre", "desembre"
];

const MESOS_LABELS = [
  "Gen", "Feb", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Oct", "Nov", "Des"
];

const DISTRICTES_EXCLOSOS = [
  "ciutat vella",
  "eixample",
  "sants-montjuic",
  "sants montjuic",
  "les corts",
  "sarria-sant gervasi",
  "sarria sant gervasi",
  "gracia",
  "horta-guinardo",
  "horta guinardo",
  "nou barris",
  "sant andreu",
  "sant marti",
  "sant martí"
];

let APP_DATA = null;
let AUTOGESTIONADES = [];
let COLUMN_KEYS = {};

let mapInstance = null;
let mapInitialised = false;

let PRO_CALENDAR_ROWS = [];
let PRO_CALENDAR_AUTOGESTIONADES = [];
let PRO_CALENDAR_MONTH = 0;
let PRO_CALENDAR_YEAR = 2026;
let PRO_CALENDAR_READY = false;
let PRO_CALENDAR_LOOKUP = new Map();
let PRO_CALENDAR_MODE = "all";


let CALENDAR_ROWS = [];
let CALENDAR_DATE = null;
let CALENDAR_EVENT_LOOKUP = new Map();
let calendarListenersInitialised = false;

document.addEventListener("DOMContentLoaded", () => {
  activarNavegacio();
  carregarDades();
});

function activarNavegacio() {
  const buttons = document.querySelectorAll(".nav-pill");
  const views = document.querySelectorAll(".view");

  buttons.forEach(button => {
    button.addEventListener("click", async () => {
      const viewId = button.dataset.view;

      buttons.forEach(btn => btn.classList.remove("active"));
      views.forEach(view => view.classList.remove("active"));

      button.classList.add("active");
      document.getElementById(viewId)?.classList.add("active");

      if (viewId === "view-mapa" && APP_DATA) {
        await renderitzarMapaAutogestionades();
        setTimeout(() => {
          if (mapInstance) mapInstance.invalidateSize();
        }, 200);
      }
    });
  });
}

async function carregarDades() {
  const status = document.getElementById("status");

  try {
    status.textContent = "Carregant dades guardades...";

    const response = await fetch(`${DATA_URL}?t=${Date.now()}`);

    if (!response.ok) {
      throw new Error("No s'ha pogut carregar data/inscripcions.json");
    }

    APP_DATA = await response.json();
    renderitzarDades(APP_DATA);

    status.textContent =
      `Dades carregades correctament · JSON actualitzat: ${APP_DATA.meta?.updatedAt || "sense data"} · ` +
      `passis: ${APP_DATA.summary?.totalPassis || 0} · ` +
      `autogestionades: ${APP_DATA.summary?.passisGestio || 0}`;

  } catch (error) {
    console.error(error);
    status.textContent = "No s'han pogut carregar les dades. Revisa que existeixi data/inscripcions.json.";
  }
}

function renderitzarDades(data) {
  const summary = data.summary || {};
  COLUMN_KEYS = data.columnKeys || summary.columnesExportades || {};
  const rows = data.rows || [];

  CALENDAR_ROWS = rows;
  inicialitzarCalendari(rows);

  AUTOGESTIONADES = rows.filter(row => valorEsTrue(row[COLUMN_KEYS.gestio]));
  initializeProfessionalCalendar(rows, AUTOGESTIONADES);

  const totalCharts = generarResumGrafiques(rows);
  const autoCharts = generarResumGrafiques(AUTOGESTIONADES);

  posarText("kpi-total-passis", summary.totalPassis || rows.length || 0);
  posarText("kpi-passis-importants", summary.passisGestio || AUTOGESTIONADES.length || 0);

  // TOTAL PASSIS: totes les files
  renderitzarBarChart("chart-tipus-entrada", totalCharts.tipusEntrada);
  renderitzarBarChart("chart-modalitat", totalCharts.modalitat);
  renderitzarBarChart("chart-responsable", totalCharts.responsable);

  renderitzarAreaChartMesos(
    "chart-any-complet",
    objecteMesosAArray(summary.activitatsPerMes),
    "Totes les activitats"
  );

  // ACTIVITATS AUTOGESTIONADES: només PRÒPIES = TRUE
  renderitzarBarChart("chart-tipus-entrada-auto", autoCharts.tipusEntrada);
  renderitzarBarChart("chart-modalitat-auto", autoCharts.modalitat);
  renderitzarBarChart("chart-responsable-auto", autoCharts.responsable);

  renderitzarAreaChartMesos(
    "chart-any-gestio",
    objecteMesosAArray(summary.activitatsGestioPerMes),
    "Activitats gestionades per nosaltres"
  );

  renderitzarTaulaAutogestionades(AUTOGESTIONADES);
  activarCercadorAutogestionades();
}

function generarResumGrafiques(rows) {
  return {
    tipusEntrada: comptarTipusEntrada(rows),
    modalitat: comptarModalitat(rows),
    responsable: comptarResponsable(rows)
  };
}

function comptarTipusEntrada(rows) {
  const result = {
    "Gratuïta": 0,
    "Gratuïta amb inscripció prèvia": 0,
    "De pagament": 0,
    "Sense informació": 0
  };

  rows.forEach(row => {
    const value = classificarTipusEntrada(row[COLUMN_KEYS.entrada]);
    result[value]++;
  });

  return result;
}

function comptarModalitat(rows) {
  const result = {
    "A": 0,
    "B": 0,
    "C": 0,
    "Sense modalitat": 0
  };

  rows.forEach(row => {
    const value = String(row[COLUMN_KEYS.modalitat] || "").trim().toUpperCase();

    if (["A", "B", "C"].includes(value)) {
      result[value]++;
    } else {
      result["Sense modalitat"]++;
    }
  });

  return result;
}

function comptarResponsable(rows) {
  const result = {
    "Marc": 0,
    "Hotaru": 0,
    "Laida": 0,
    "Roger": 0,
    "Cristian": 0,
    "Neda": 0,
    "Altres": 0,
    "Sense responsable": 0
  };

  rows.forEach(row => {
    const value = classificarResponsable(row[COLUMN_KEYS.responsable]);
    result[value]++;
  });

  return result;
}

function classificarTipusEntrada(value) {
  const text = normalitzarText(value);

  if (!text) return "Sense informació";
  if (text.includes("inscripcio")) return "Gratuïta amb inscripció prèvia";
  if (text.includes("pagament") || text.includes("pago")) return "De pagament";
  if (text.includes("gratuita") || text.includes("gratuit")) return "Gratuïta";

  return "Sense informació";
}

function classificarResponsable(value) {
  const text = normalitzarText(value);

  if (!text) return "Sense responsable";

  const responsables = ["Marc", "Hotaru", "Laida", "Roger", "Cristian", "Neda"];

  for (const responsable of responsables) {
    if (text.includes(normalitzarText(responsable))) {
      return responsable;
    }
  }

  return "Altres";
}

function activarCercadorAutogestionades() {
  const input = document.getElementById("search-autogestionades");
  if (!input) return;

  input.addEventListener("input", () => {
    const query = normalitzarText(input.value);

    const filtrades = AUTOGESTIONADES.filter(row => {
      const text = [
        row[COLUMN_KEYS.idIntern],
        row[COLUMN_KEYS.responsable],
        row[COLUMN_KEYS.titol],
        row[COLUMN_KEYS.dataInici],
        row[COLUMN_KEYS.categoria],
        row[COLUMN_KEYS.espai]
      ].map(normalitzarText).join(" ");

      return text.includes(query);
    });

    renderitzarTaulaAutogestionades(filtrades);
  });
}

function renderitzarTaulaAutogestionades(rows) {
  const tbody = document.getElementById("taula-autogestionades-body");
  const counter = document.getElementById("autogestionades-count");

  if (!tbody) return;

  if (counter) {
    counter.textContent = `${rows.length} activitats`;
  }

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7">No s'han trobat activitats autogestionades.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(row => {
    const enllac = String(row[COLUMN_KEYS.enllacInscripcions] || "").trim();
    const linkCell = enllac
      ? `<a class="link-pill" href="${escaparAtribut(enllac)}" target="_blank" rel="noopener noreferrer">Obrir enllaç</a>`
      : `<span class="warning-pill">Falta enllaç</span>`;

    return `
      <tr>
        <td>${escaparHTML(row[COLUMN_KEYS.idIntern])}</td>
        <td>${escaparHTML(row[COLUMN_KEYS.responsable])}</td>
        <td class="title-cell">${escaparHTML(row[COLUMN_KEYS.titol])}</td>
        <td>${escaparHTML(row[COLUMN_KEYS.dataInici])}</td>
        <td>${escaparHTML(row[COLUMN_KEYS.categoria])}</td>
        <td>${escaparHTML(row[COLUMN_KEYS.espai])}</td>
        <td>${linkCell}</td>
      </tr>
    `;
  }).join("");
}

async function renderitzarMapaAutogestionades() {
  const mapStatus = document.getElementById("map-status");
  const mapCounter = document.getElementById("map-counter");
  const mapEl = document.getElementById("autogestionades-map");

  if (!mapEl) return;

  if (!mapInstance) {
    mapInstance = L.map("autogestionades-map", {
      zoomControl: true
    }).setView([41.3874, 2.1686], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(mapInstance);
  }

  if (mapInitialised) {
    setTimeout(() => mapInstance.invalidateSize(), 150);
    return;
  }

  mapStatus.textContent = "Localitzant espais...";
  mapCounter.textContent = "Preparant punts...";
  mapInitialised = true;

  const espais = prepararEspaisMapa(AUTOGESTIONADES);

  if (!espais.length) {
    mapStatus.textContent = "No s'han trobat espais vàlids per representar.";
    mapCounter.textContent = "0 espais";
    return;
  }

  const bounds = [];
  let trobats = 0;
  let noTrobats = 0;

  for (let i = 0; i < espais.length; i++) {
    const espai = espais[i];
    mapStatus.textContent = `Localitzant espais... ${i + 1}/${espais.length}`;

    const coords = await geocodificarEspai(espai.nom);

    if (coords) {
      trobats++;

      const marker = L.marker([coords.lat, coords.lng]).addTo(mapInstance);

      const activitatsHtml = espai.activitats
        .slice(0, 5)
        .map(item => `<li>${escaparHTML(item.titol)} <span>(${escaparHTML(item.data)})</span></li>`)
        .join("");

      marker.bindPopup(`
        <div class="map-popup">
          <strong>${escaparHTML(espai.nom)}</strong>
          <p>${espai.total} activitats autogestionades</p>
          <ul>${activitatsHtml}</ul>
        </div>
      `);

      bounds.push([coords.lat, coords.lng]);
    } else {
      noTrobats++;
    }
  }

  if (bounds.length) {
    mapInstance.fitBounds(bounds, { padding: [40, 40] });
  } else {
    mapInstance.setView([41.3874, 2.1686], 12);
  }

  mapCounter.textContent = `${trobats} espais localitzats`;
  mapStatus.textContent = noTrobats
    ? `${noTrobats} espais no s'han pogut localitzar automàticament.`
    : "Mapa preparat correctament.";

  setTimeout(() => mapInstance.invalidateSize(), 150);
}

function prepararEspaisMapa(rows) {
  const grouped = new Map();

  rows.forEach(row => {
    const espaiOriginal = String(row[COLUMN_KEYS.espai] || "").trim();
    if (!espaiOriginal) return;
    if (esDistricte(espaiOriginal)) return;

    const key = normalitzarText(espaiOriginal);

    if (!grouped.has(key)) {
      grouped.set(key, {
        nom: espaiOriginal,
        total: 0,
        activitats: []
      });
    }

    const entry = grouped.get(key);
    entry.total += 1;
    entry.activitats.push({
      titol: row[COLUMN_KEYS.titol] || "Sense títol",
      data: row[COLUMN_KEYS.dataInici] || ""
    });
  });

  return [...grouped.values()];
}

function esDistricte(value) {
  const text = normalitzarText(value);
  return DISTRICTES_EXCLOSOS.includes(text);
}

async function geocodificarEspai(nomEspai) {
  const cacheKey = `geo_${normalitzarText(nomEspai)}`;
  const cache = carregarGeocache();

  if (cache[cacheKey]) {
    return cache[cacheKey];
  }

  const query = encodeURIComponent(`${nomEspai}, Barcelona, Spain`);
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${query}`;

  try {
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      return null;
    }

    const results = await response.json();

    if (!results.length) {
      return null;
    }

    const coords = {
      lat: Number(results[0].lat),
      lng: Number(results[0].lon)
    };

    cache[cacheKey] = coords;
    guardarGeocache(cache);

    await sleep(250);
    return coords;
  } catch (error) {
    console.error("Error geocodificant espai:", nomEspai, error);
    return null;
  }
}

function carregarGeocache() {
  try {
    return JSON.parse(localStorage.getItem("capitalitat_geocache_v1") || "{}");
  } catch {
    return {};
  }
}

function guardarGeocache(cache) {
  localStorage.setItem("capitalitat_geocache_v1", JSON.stringify(cache));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


function inicialitzarCalendari(rows) {
  configurarControlsCalendari();

  const dates = rows
    .map(row => parseDataCalendari(row[COLUMN_KEYS.dataInici]))
    .filter(Boolean);

  const avui = new Date();

  if (!CALENDAR_DATE) {
    const teActivitatsAquestMes = dates.some(date =>
      date.getFullYear() === avui.getFullYear() &&
      date.getMonth() === avui.getMonth()
    );

    if (teActivitatsAquestMes) {
      CALENDAR_DATE = new Date(avui.getFullYear(), avui.getMonth(), 1);
    } else if (dates.length) {
      dates.sort((a, b) => a - b);
      CALENDAR_DATE = new Date(dates[0].getFullYear(), dates[0].getMonth(), 1);
    } else {
      CALENDAR_DATE = new Date(avui.getFullYear(), avui.getMonth(), 1);
    }
  }

  renderitzarCalendariActual();
}

function configurarControlsCalendari() {
  if (calendarListenersInitialised) return;

  const prev = document.getElementById("calendar-prev");
  const next = document.getElementById("calendar-next");
  const grid = document.getElementById("calendar-grid");

  if (prev) {
    prev.addEventListener("click", () => {
      CALENDAR_DATE = new Date(CALENDAR_DATE.getFullYear(), CALENDAR_DATE.getMonth() - 1, 1);
      renderitzarCalendariActual();
    });
  }

  if (next) {
    next.addEventListener("click", () => {
      CALENDAR_DATE = new Date(CALENDAR_DATE.getFullYear(), CALENDAR_DATE.getMonth() + 1, 1);
      renderitzarCalendariActual();
    });
  }

  if (grid) {
    grid.addEventListener("click", event => {
      const button = event.target.closest("[data-calendar-event]");
      if (!button) return;

      const eventId = button.dataset.calendarEvent;
      const row = CALENDAR_EVENT_LOOKUP.get(eventId);

      if (row) {
        renderitzarDetallCalendari(row);
      }
    });
  }

  calendarListenersInitialised = true;
}

function renderitzarCalendariActual() {
  const title = document.getElementById("calendar-title");
  const subtitle = document.getElementById("calendar-subtitle");
  const grid = document.getElementById("calendar-grid");

  if (!grid || !CALENDAR_DATE) return;

  const any = CALENDAR_DATE.getFullYear();
  const mes = CALENDAR_DATE.getMonth();

  const monthLabel = CALENDAR_DATE.toLocaleDateString("ca-ES", {
    month: "long",
    year: "numeric"
  });

  if (title) {
    title.textContent = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
  }

  const activitatsMes = obtenirActivitatsCalendari(any, mes);

  if (subtitle) {
    subtitle.textContent = `${activitatsMes.length} activitats amb data d'inici aquest mes`;
  }

  CALENDAR_EVENT_LOOKUP = new Map();

  const primerDiaMes = new Date(any, mes, 1);
  const ultimDiaMes = new Date(any, mes + 1, 0);
  const diesMes = ultimDiaMes.getDate();

  const offsetDilluns = (primerDiaMes.getDay() + 6) % 7;
  const totalCells = Math.ceil((offsetDilluns + diesMes) / 7) * 7;

  const activitatsPerDia = new Map();

  activitatsMes.forEach((item, index) => {
    const dia = item.date.getDate();

    if (!activitatsPerDia.has(dia)) {
      activitatsPerDia.set(dia, []);
    }

    const eventId = `cal-${item.row.__fila || index}-${index}`;
    CALENDAR_EVENT_LOOKUP.set(eventId, item.row);

    activitatsPerDia.get(dia).push({
      eventId,
      row: item.row
    });
  });

  let cells = "";

  for (let i = 0; i < totalCells; i++) {
    const dayNumber = i - offsetDilluns + 1;
    const isOutside = dayNumber < 1 || dayNumber > diesMes;
    const avui = new Date();
    const isToday =
      !isOutside &&
      avui.getFullYear() === any &&
      avui.getMonth() === mes &&
      avui.getDate() === dayNumber;

    if (isOutside) {
      cells += `<div class="calendar-day calendar-day-empty"></div>`;
      continue;
    }

    const events = activitatsPerDia.get(dayNumber) || [];
    const visibleEvents = events.slice(0, 4);
    const hiddenCount = Math.max(events.length - visibleEvents.length, 0);

    const eventsHtml = visibleEvents.map(event => {
      const row = event.row;
      const id = row[COLUMN_KEYS.idIntern] || "";
      const titol = row[COLUMN_KEYS.titol] || "Sense títol";

      return `
        <button class="calendar-event" type="button" data-calendar-event="${escaparAtribut(event.eventId)}">
          <span>${escaparHTML(id)}</span>
          <strong>${escaparHTML(titol)}</strong>
        </button>
      `;
    }).join("");

    cells += `
      <div class="calendar-day ${isToday ? "calendar-day-today" : ""}">
        <div class="calendar-day-number">${dayNumber}</div>
        <div class="calendar-events">
          ${eventsHtml}
          ${hiddenCount ? `<div class="calendar-more">+${hiddenCount} activitats més</div>` : ""}
        </div>
      </div>
    `;
  }

  grid.innerHTML = cells;
}

function obtenirActivitatsCalendari(any, mes) {
  return CALENDAR_ROWS
    .map(row => {
      const date = parseDataCalendari(row[COLUMN_KEYS.dataInici]);
      return { row, date };
    })
    .filter(item =>
      item.date &&
      item.date.getFullYear() === any &&
      item.date.getMonth() === mes
    )
    .sort((a, b) => {
      const dateDiff = a.date - b.date;
      if (dateDiff !== 0) return dateDiff;

      return String(a.row[COLUMN_KEYS.horaInici] || "").localeCompare(
        String(b.row[COLUMN_KEYS.horaInici] || "")
      );
    });
}

function renderitzarDetallCalendari(row) {
  const detail = document.getElementById("calendar-detail");
  if (!detail) return;

  const enllac = String(row[COLUMN_KEYS.enllacInscripcions] || "").trim();

  const linkHtml = enllac
    ? `<a class="detail-link" href="${escaparAtribut(enllac)}" target="_blank" rel="noopener noreferrer">Obrir enllaç d'inscripcions</a>`
    : `<span class="warning-pill">Falta enllaç d'inscripcions</span>`;

  detail.innerHTML = `
    <span class="detail-eyebrow">Detall activitat</span>
    <h3>${escaparHTML(row[COLUMN_KEYS.titol] || "Sense títol")}</h3>

    <div class="detail-list">
      ${detailItem("ID intern", row[COLUMN_KEYS.idIntern])}
      ${detailItem("Encarregada", row[COLUMN_KEYS.responsable])}
      ${detailItem("Modalitat", row[COLUMN_KEYS.modalitat])}
      ${detailItem("Data inici", row[COLUMN_KEYS.dataInici])}
      ${detailItem("Hora inici", row[COLUMN_KEYS.horaInici])}
      ${detailItem("Categoria", row[COLUMN_KEYS.categoria])}
      ${detailItem("Espai", row[COLUMN_KEYS.espai])}
    </div>

    <div class="detail-actions">
      ${linkHtml}
    </div>
  `;
}

function detailItem(label, value) {
  return `
    <div class="detail-item">
      <span>${escaparHTML(label)}</span>
      <strong>${escaparHTML(value || "—")}</strong>
    </div>
  `;
}

function parseDataCalendari(value) {
  const text = String(value || "").trim();

  if (!text) return null;

  const formatDMY = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (formatDMY) {
    const dia = Number(formatDMY[1]);
    const mes = Number(formatDMY[2]) - 1;
    let any = Number(formatDMY[3]);

    if (any < 100) any += 2000;

    const date = new Date(any, mes, dia);

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  const formatYMD = text.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (formatYMD) {
    const any = Number(formatYMD[1]);
    const mes = Number(formatYMD[2]) - 1;
    const dia = Number(formatYMD[3]);

    const date = new Date(any, mes, dia);

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  const date = new Date(text);

  if (!Number.isNaN(date.getTime())) {
    return date;
  }

  return null;
}


function objecteMesosAArray(objecte) {
  if (!objecte) return new Array(12).fill(0);
  return MESOS_KEYS.map(key => Number(objecte[key] || 0));
}

function renderitzarAreaChartMesos(containerId, valors, subtitol) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const width = 1000;
  const height = 360;
  const margin = { top: 24, right: 24, bottom: 52, left: 54 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const baseY = margin.top + plotHeight;
  const stepX = plotWidth / 11;

  const maxValorReal = Math.max(...valors, 1);
  const maxValor = arrodonirMaxGrafic(maxValorReal);

  const points = valors.map((valor, i) => {
    const x = margin.left + stepX * i;
    const y = baseY - (valor / maxValor) * plotHeight;
    return { x, y, valor, mes: MESOS_LABELS[i] };
  });

  const linePath = construirPathSuau(points);
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${baseY} L ${points[0].x} ${baseY} Z`;
  const ticks = obtenirTicksY(maxValor);
  const uid = containerId.replace(/[^a-zA-Z0-9]/g, "");

  const horizontalGrid = ticks.map(valorTick => {
    const y = baseY - (valorTick / maxValor) * plotHeight;
    return `
      <line x1="${margin.left}" y1="${y}" x2="${margin.left + plotWidth}" y2="${y}" class="chart-grid-horizontal" />
      <text x="${margin.left - 12}" y="${y + 4}" text-anchor="end" class="chart-axis-label">${valorTick}</text>
    `;
  }).join("");

  const verticalGrid = points.map(point => `
    <line x1="${point.x}" y1="${margin.top}" x2="${point.x}" y2="${baseY}" class="chart-grid-vertical" />
  `).join("");

  const xLabels = points.map(point => `
    <text x="${point.x}" y="${baseY + 28}" text-anchor="middle" class="chart-axis-label">${point.mes}</text>
  `).join("");

  const dots = points.map(point => `
    <circle cx="${point.x}" cy="${point.y}" r="4.5" class="chart-point-glow" />
    <circle cx="${point.x}" cy="${point.y}" r="2.5" class="chart-point-core" />
  `).join("");

  container.innerHTML = `
    <div class="chart-meta">
      <span class="chart-kicker">${escaparHTML(subtitol)}</span>
      <span class="chart-side-label">Número d'activitats</span>
    </div>

    <svg viewBox="0 0 ${width} ${height}" class="mountain-chart">
      <defs>
        <linearGradient id="${uid}AreaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFE45C" stop-opacity="0.95" />
          <stop offset="45%" stop-color="#FFD028" stop-opacity="0.40" />
          <stop offset="100%" stop-color="#FFD028" stop-opacity="0.02" />
        </linearGradient>

        <linearGradient id="${uid}LineGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#FFF4A8" />
          <stop offset="45%" stop-color="#FFE45C" />
          <stop offset="100%" stop-color="#FFCB1F" />
        </linearGradient>

        <filter id="${uid}Glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      ${verticalGrid}
      ${horizontalGrid}

      <path d="${areaPath}" fill="url(#${uid}AreaGradient)" filter="url(#${uid}Glow)" />
      <path d="${linePath}" fill="none" stroke="url(#${uid}LineGradient)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" filter="url(#${uid}Glow)" />

      ${dots}
      ${xLabels}
    </svg>
  `;
}

function renderitzarBarChart(containerId, objecte) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const entries = Object.entries(objecte);

  if (!entries.length) {
    container.innerHTML = "<p>No hi ha dades disponibles.</p>";
    return;
  }

  const total = entries.reduce((sum, [, value]) => sum + Number(value || 0), 0);
  const max = Math.max(...entries.map(([, value]) => Number(value || 0)), 1);

  container.innerHTML = entries.map(([label, valor]) => {
    valor = Number(valor || 0);
    const width = valor > 0 ? Math.max((valor / max) * 100, 3) : 0;
    const percent = total > 0 ? Math.round((valor / total) * 100) : 0;

    return `
      <div class="bar-row">
        <div class="bar-info">
          <span>${escaparHTML(label)}</span>
          <strong>${valor}</strong>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${width}%"></div>
        </div>
        <div class="bar-percent">${percent}%</div>
      </div>
    `;
  }).join("");
}

function valorEsTrue(value) {
  const text = normalitzarText(value);
  return text === "true" || text === "verdadero" || text === "cert" || text === "si" || text === "sí" || text === "x";
}

function construirPathSuau(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 1; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2;
    const yc = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x} ${points[i].y} ${xc} ${yc}`;
  }

  d += ` T ${points[points.length - 1].x} ${points[points.length - 1].y}`;
  return d;
}

function obtenirTicksY(maxValor) {
  const ticks = [maxValor, Math.round(maxValor * 0.66), Math.round(maxValor * 0.33), 0];
  return [...new Set(ticks)].sort((a, b) => b - a);
}

function arrodonirMaxGrafic(value) {
  if (value <= 5) return 5;
  if (value <= 10) return 10;
  if (value <= 20) return Math.ceil(value / 2) * 2;
  if (value <= 50) return Math.ceil(value / 5) * 5;
  return Math.ceil(value / 10) * 10;
}

function posarText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function normalitzarText(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function escaparHTML(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escaparAtribut(value) {
  return escaparHTML(value).replaceAll("`", "&#096;");
}


function initializeProfessionalCalendar(allRows, autoRows) {
  PRO_CALENDAR_ROWS = allRows || [];
  PRO_CALENDAR_AUTOGESTIONADES = autoRows || [];

  const sourceRows = PRO_CALENDAR_ROWS.length ? PRO_CALENDAR_ROWS : PRO_CALENDAR_AUTOGESTIONADES;

  const firstDate = sourceRows
    .map(row => parseCalendarDate(row[COLUMN_KEYS.dataInici]))
    .filter(Boolean)
    .sort((a, b) => a - b)[0];

  if (!PRO_CALENDAR_READY) {
    if (firstDate) {
      PRO_CALENDAR_YEAR = firstDate.getFullYear();
      PRO_CALENDAR_MONTH = firstDate.getMonth();
    }
    setupProfessionalCalendarEvents();
    PRO_CALENDAR_READY = true;
  }

  renderProfessionalCalendar();
}

function setupProfessionalCalendarEvents() {
  const prev = document.getElementById("pro-calendar-prev");
  const next = document.getElementById("pro-calendar-next");
  const months = document.getElementById("pro-calendar-months");
  const grid = document.getElementById("pro-calendar-grid");
  const modeToggle = document.getElementById("calendar-mode-toggle");

  if (prev && !prev.dataset.bound) {
    prev.addEventListener("click", () => {
      PRO_CALENDAR_MONTH--;
      if (PRO_CALENDAR_MONTH < 0) {
        PRO_CALENDAR_MONTH = 11;
        PRO_CALENDAR_YEAR--;
      }
      renderProfessionalCalendar();
    });
    prev.dataset.bound = "1";
  }

  if (next && !next.dataset.bound) {
    next.addEventListener("click", () => {
      PRO_CALENDAR_MONTH++;
      if (PRO_CALENDAR_MONTH > 11) {
        PRO_CALENDAR_MONTH = 0;
        PRO_CALENDAR_YEAR++;
      }
      renderProfessionalCalendar();
    });
    next.dataset.bound = "1";
  }

  if (months && !months.dataset.bound) {
    months.addEventListener("click", event => {
      const button = event.target.closest("[data-month]");
      if (!button) return;

      PRO_CALENDAR_MONTH = Number(button.dataset.month);
      renderProfessionalCalendar();
    });
    months.dataset.bound = "1";
  }

  if (grid && !grid.dataset.bound) {
    grid.addEventListener("click", event => {
      const button = event.target.closest("[data-calendar-event]");
      if (!button) return;

      const row = PRO_CALENDAR_LOOKUP.get(button.dataset.calendarEvent);
      if (row) {
        renderProfessionalCalendarDetail(row);
      }
    });
    grid.dataset.bound = "1";
  }

  if (modeToggle && !modeToggle.dataset.bound) {
    modeToggle.addEventListener("click", event => {
      const button = event.target.closest("[data-calendar-mode]");
      if (!button) return;

      PRO_CALENDAR_MODE = button.dataset.calendarMode;
      renderProfessionalCalendar();
    });
    modeToggle.dataset.bound = "1";
  }
}

function getProfessionalCalendarWorkingRows() {
  return PRO_CALENDAR_MODE === "auto"
    ? PRO_CALENDAR_AUTOGESTIONADES
    : PRO_CALENDAR_ROWS;
}

function renderProfessionalCalendar() {
  const grid = document.getElementById("pro-calendar-grid");
  const title = document.getElementById("pro-calendar-title");
  const subtitle = document.getElementById("pro-calendar-subtitle");
  const months = document.getElementById("pro-calendar-months");
  const modeToggle = document.getElementById("calendar-mode-toggle");

  if (!grid) return;

  const monthDate = new Date(PRO_CALENDAR_YEAR, PRO_CALENDAR_MONTH, 1);
  const monthName = monthDate.toLocaleDateString("ca-ES", {
    month: "long",
    year: "numeric"
  });

  if (title) {
    title.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  }

  if (months) {
    months.querySelectorAll("[data-month]").forEach(button => {
      button.classList.toggle("active", Number(button.dataset.month) === PRO_CALENDAR_MONTH);
    });
  }

  if (modeToggle) {
    modeToggle.querySelectorAll("[data-calendar-mode]").forEach(button => {
      button.classList.toggle("active", button.dataset.calendarMode === PRO_CALENDAR_MODE);
    });
  }

  const events = getProfessionalCalendarEvents(PRO_CALENDAR_YEAR, PRO_CALENDAR_MONTH);

  if (subtitle) {
    const labelMode = PRO_CALENDAR_MODE === "auto" ? "autogestionades" : "totals";
    subtitle.textContent = `${events.length} activitats ${labelMode} aquest mes`;
  }

  PRO_CALENDAR_LOOKUP = new Map();

  const firstDay = new Date(PRO_CALENDAR_YEAR, PRO_CALENDAR_MONTH, 1);
  const lastDay = new Date(PRO_CALENDAR_YEAR, PRO_CALENDAR_MONTH + 1, 0);
  const daysInMonth = lastDay.getDate();

  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const totalCells = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;

  const eventsByDay = new Map();

  events.forEach((eventItem, index) => {
    const day = eventItem.date.getDate();

    if (!eventsByDay.has(day)) {
      eventsByDay.set(day, []);
    }

    const eventId = `event-${eventItem.row.__fila || index}-${index}`;
    PRO_CALENDAR_LOOKUP.set(eventId, eventItem.row);

    eventsByDay.get(day).push({
      id: eventId,
      row: eventItem.row
    });
  });

  let html = "";

  for (let cell = 0; cell < totalCells; cell++) {
    const day = cell - mondayOffset + 1;

    if (day < 1 || day > daysInMonth) {
      html += `<div class="pro-calendar-day is-empty"></div>`;
      continue;
    }

    const dayEvents = eventsByDay.get(day) || [];
    const visibleEvents = dayEvents.slice(0, 4);
    const moreCount = Math.max(dayEvents.length - visibleEvents.length, 0);

    const eventsHtml = visibleEvents.map(item => {
      const idIntern = item.row[COLUMN_KEYS.idIntern] || "";
      const titol = item.row[COLUMN_KEYS.titol] || "Sense títol";

      return `
        <button class="pro-calendar-event" type="button" data-calendar-event="${escaparAtribut(item.id)}">
          <span>${escaparHTML(idIntern)}</span>
          <strong>${escaparHTML(titol)}</strong>
        </button>
      `;
    }).join("");

    html += `
      <div class="pro-calendar-day">
        <div class="pro-calendar-day-number">${day}</div>
        <div class="pro-calendar-events">
          ${eventsHtml}
          ${moreCount ? `<div class="pro-calendar-more">+${moreCount} activitats més</div>` : ""}
        </div>
      </div>
    `;
  }

  grid.innerHTML = html;
}

function getProfessionalCalendarEvents(year, month) {
  const workingRows = getProfessionalCalendarWorkingRows();

  return workingRows
    .map(row => {
      return {
        row,
        date: parseCalendarDate(row[COLUMN_KEYS.dataInici])
      };
    })
    .filter(item => {
      return (
        item.date &&
        item.date.getFullYear() === year &&
        item.date.getMonth() === month
      );
    })
    .sort((a, b) => {
      const dateDiff = a.date - b.date;
      if (dateDiff !== 0) return dateDiff;

      return String(a.row[COLUMN_KEYS.horaInici] || "").localeCompare(
        String(b.row[COLUMN_KEYS.horaInici] || "")
      );
    });
}

function renderProfessionalCalendarDetail(row) {
  const detail = document.getElementById("pro-calendar-detail");
  if (!detail) return;

  const enllac = String(row[COLUMN_KEYS.enllacInscripcions] || "").trim();

  const linkHtml = enllac
    ? `<a class="detail-link" href="${escaparAtribut(enllac)}" target="_blank" rel="noopener noreferrer">Obrir enllaç d'inscripcions</a>`
    : `<span class="warning-pill">Falta enllaç d'inscripcions</span>`;

  detail.innerHTML = `
    <span class="detail-eyebrow">Detall activitat</span>
    <h3>${escaparHTML(row[COLUMN_KEYS.titol] || "Sense títol")}</h3>

    <div class="detail-list">
      ${detailItem("ID intern", row[COLUMN_KEYS.idIntern])}
      ${detailItem("Encarregada", row[COLUMN_KEYS.responsable])}
      ${detailItem("Títol activitat", row[COLUMN_KEYS.titol])}
      ${detailItem("Modalitat", row[COLUMN_KEYS.modalitat])}
      ${detailItem("Data inici", row[COLUMN_KEYS.dataInici])}
      ${detailItem("Hora inici", row[COLUMN_KEYS.horaInici])}
      ${detailItem("Categoria", row[COLUMN_KEYS.categoria])}
      ${detailItem("Espai", row[COLUMN_KEYS.espai])}
    </div>

    <div class="detail-actions">
      ${linkHtml}
    </div>
  `;
}

function detailItem(label, value) {
  return `
    <div class="detail-item">
      <span>${escaparHTML(label)}</span>
      <strong>${escaparHTML(value || "—")}</strong>
    </div>
  `;
}

function parseCalendarDate(value) {
  const text = String(value || "").trim();

  if (!text) return null;

  const dmy = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]) - 1;
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;

    const date = new Date(year, month, day);
    if (!Number.isNaN(date.getTime())) return date;
  }

  const ymd = text.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]) - 1;
    const day = Number(ymd[3]);

    const date = new Date(year, month, day);
    if (!Number.isNaN(date.getTime())) return date;
  }

  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) return date;

  return null;
}
