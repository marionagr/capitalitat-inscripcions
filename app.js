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
let COLUMN_KEYS = {};
let AUTOGESTIONADES = [];

let mapInstance = null;
let mapInitialised = false;

let PRO_CALENDAR_ROWS = [];
let PRO_CALENDAR_AUTOGESTIONADES = [];
let PRO_CALENDAR_MONTH = 0;
let PRO_CALENDAR_YEAR = 2026;
let PRO_CALENDAR_READY = false;
let PRO_CALENDAR_LOOKUP = new Map();
let PRO_CALENDAR_MODE = "all";

document.addEventListener("DOMContentLoaded", () => {
  activarNavegacio();
  activarAnimacioLogoCapitalitat();
  activarIntroInicialCapitalitat();
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

      if (viewId === "view-calendari" && APP_DATA) {
        renderProfessionalCalendar();
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

  AUTOGESTIONADES = rows.filter(row => valorEsTrue(getValue(row, "gestio")));

  const totalCharts = generarResumGrafiques(rows);
  const autoCharts = generarResumGrafiques(AUTOGESTIONADES);

  posarText("kpi-total-passis", summary.totalPassis || rows.length || 0);
  posarText("kpi-passis-importants", summary.passisGestio || AUTOGESTIONADES.length || 0);

  renderitzarBarChart("chart-categoria", totalCharts.categoria);
  renderitzarBarChart("chart-districte", totalCharts.districte);
  renderitzarBarChart("chart-tipus-entrada", totalCharts.tipusEntrada);
  renderitzarBarChart("chart-modalitat", totalCharts.modalitat);
  renderitzarBarChart("chart-responsable", totalCharts.responsable);

  renderitzarAreaChartMesos(
    "chart-any-complet",
    objecteMesosAArray(summary.activitatsPerMes),
    "Totes les activitats"
  );

  renderitzarBarChart("chart-tipus-entrada-auto", autoCharts.tipusEntrada);
  renderitzarBarChart("chart-modalitat-auto", autoCharts.modalitat);
  renderitzarBarChart("chart-responsable-auto", autoCharts.responsable);

  renderitzarAreaChartMesos(
    "chart-any-gestio",
    objecteMesosAArray(summary.activitatsGestioPerMes),
    "Activitats gestionades per nosaltres"
  );

  inicialitzarCalendari(rows, AUTOGESTIONADES);
  renderitzarTaulaAutogestionades(AUTOGESTIONADES);
  activarCercadorAutogestionades();

  console.log("DEBUG DADES", {
    totalRows: rows.length,
    autogestionades: AUTOGESTIONADES.length,
    columnKeys: COLUMN_KEYS,
    totalCharts
  });
}

/* =========================
   VALORS I COLUMNES
========================= */

function getKeys(logicalKey) {
  const aliases = {
    idIntern: [COLUMN_KEYS.idIntern, "id_intern", "id intern", "id"],
    responsable: [COLUMN_KEYS.responsable, "encarregada", "responsable"],
    gestio: [COLUMN_KEYS.gestio, "propies", "pròpies", "propis", "gestio"],
    titol: [COLUMN_KEYS.titol, "titol_activitat_cat", "títol activitat cat", "titol activitat cat", "titol"],
    modalitat: [COLUMN_KEYS.modalitat, "modalitat"],
    dataInici: [COLUMN_KEYS.dataInici, "data_inici", "data_inici_", "data inici", "data inici_"],
    horaInici: [COLUMN_KEYS.horaInici, "hora_inici", "hora inici"],
    categoria: [COLUMN_KEYS.categoria, "categoria"],
    districte: [COLUMN_KEYS.districte, "districte", "distrito"],
    espai: [COLUMN_KEYS.espai, "espai_on_es_desenvolupara_l_activitat", "espai on es desenvoluparà l'activitat", "espai"],
    entrada: [COLUMN_KEYS.entrada, "entrada", "tipus_entrada", "tipus entrada"],
    enllacInscripcions: [COLUMN_KEYS.enllacInscripcions, "enllac_inscripcions", "enllaç_inscripcions", "enllac inscripcions", "enllaç inscripcions"]
  };

  return aliases[logicalKey] || [COLUMN_KEYS[logicalKey]];
}

function getValue(row, logicalKey) {
  const keys = getKeys(logicalKey);

  for (const key of keys) {
    if (!key) continue;

    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return String(row[key] || "").trim();
    }
  }

  const wanted = keys.map(normalitzarText).filter(Boolean);

  for (const realKey of Object.keys(row)) {
    if (wanted.includes(normalitzarText(realKey))) {
      return String(row[realKey] || "").trim();
    }
  }

  return "";
}

/* =========================
   GRÀFIQUES
========================= */

function generarResumGrafiques(rows) {
  return {
    categoria: comptarCategoria(rows),
    districte: comptarDistricte(rows),
    tipusEntrada: comptarTipusEntrada(rows),
    modalitat: comptarModalitat(rows),
    responsable: comptarResponsable(rows)
  };
}

function comptarCategoria(rows) {
  const result = {
    "Exposicions": 0,
    "Rutes": 0,
    "Debats i conferències": 0,
    "Tallers": 0,
    "Cultura Contemporània": 0,
    "Educació": 0,
    "Visites guiades": 0,
    "Altres": 0,
    "Sense categoria": 0
  };

  rows.forEach(row => {
    const value = classificarCategoria(getValue(row, "categoria"));
    result[value]++;
  });

  return result;
}

function classificarCategoria(value) {
  const text = normalitzarText(value);

  if (!text) return "Sense categoria";
  if (text.includes("exposicio")) return "Exposicions";
  if (text.includes("ruta") || text.includes("itinerari")) return "Rutes";
  if (text.includes("debat") || text.includes("conferencia") || text.includes("conferencies") || text.includes("xerrada")) return "Debats i conferències";
  if (text.includes("taller") || text.includes("workshop")) return "Tallers";
  if (text.includes("cultura contemporania") || text.includes("contemporania")) return "Cultura Contemporània";
  if (text.includes("educacio") || text.includes("educatiu") || text.includes("escola")) return "Educació";
  if (text.includes("visita guiada") || text.includes("visites guiades") || text.includes("visita")) return "Visites guiades";

  return "Altres";
}

function comptarDistricte(rows) {
  const result = {
    "Eixample": 0,
    "Les Corts": 0,
    "Sants-Montjuïc": 0,
    "Nou Barris": 0,
    "Horta-Guinardó": 0,
    "Sant Martí": 0,
    "Sarrià-Sant Gervasi": 0,
    "Sant Andreu": 0,
    "Gràcia": 0,
    "Ciutat Vella": 0,
    "Fora BCN": 0,
    "Sense districte": 0
  };

  rows.forEach(row => {
    const value = classificarDistricte(getValue(row, "districte"));
    result[value]++;
  });

  return result;
}

function classificarDistricte(value) {
  const text = normalitzarText(value);

  if (!text) return "Sense districte";
  if (text.includes("eixample")) return "Eixample";
  if (text.includes("corts")) return "Les Corts";
  if (text.includes("sants") || text.includes("montjuic")) return "Sants-Montjuïc";
  if (text.includes("nou barris")) return "Nou Barris";
  if (text.includes("horta") || text.includes("guinardo")) return "Horta-Guinardó";
  if (text.includes("sant marti")) return "Sant Martí";
  if (text.includes("sarria") || text.includes("gervasi")) return "Sarrià-Sant Gervasi";
  if (text.includes("sant andreu")) return "Sant Andreu";
  if (text.includes("gracia")) return "Gràcia";
  if (text.includes("ciutat vella")) return "Ciutat Vella";
  if (text.includes("fora") || text.includes("metropolita")) return "Fora BCN";

  return "Fora BCN";
}

function comptarTipusEntrada(rows) {
  const result = {
    "Gratuïta": 0,
    "Gratuïta amb inscripció prèvia": 0,
    "De pagament": 0,
    "Sense informació": 0
  };

  rows.forEach(row => {
    const value = classificarTipusEntrada(getValue(row, "entrada"));
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

function comptarModalitat(rows) {
  const result = {
    "A": 0,
    "B": 0,
    "C": 0,
    "Sense modalitat": 0
  };

  rows.forEach(row => {
    const value = String(getValue(row, "modalitat") || "").trim().toUpperCase();

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
    const value = classificarResponsable(getValue(row, "responsable"));
    result[value]++;
  });

  return result;
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

/* =========================
   AUTOGESTIONADES TAULA
========================= */

function activarCercadorAutogestionades() {
  const input = document.getElementById("search-autogestionades");
  if (!input || input.dataset.bound) return;

  input.addEventListener("input", () => {
    const query = normalitzarText(input.value);

    const filtrades = AUTOGESTIONADES.filter(row => {
      const text = [
        getValue(row, "idIntern"),
        getValue(row, "responsable"),
        getValue(row, "titol"),
        getValue(row, "dataInici"),
        getValue(row, "categoria"),
        getValue(row, "espai")
      ].map(normalitzarText).join(" ");

      return text.includes(query);
    });

    renderitzarTaulaAutogestionades(filtrades);
  });

  input.dataset.bound = "1";
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
    const enllac = getValue(row, "enllacInscripcions");
    const linkCell = enllac
      ? `<a class="link-pill" href="${escaparAtribut(enllac)}" target="_blank" rel="noopener noreferrer">Obrir enllaç</a>`
      : `<span class="warning-pill">Falta enllaç</span>`;

    return `
      <tr>
        <td>${escaparHTML(getValue(row, "idIntern"))}</td>
        <td>${escaparHTML(getValue(row, "responsable"))}</td>
        <td class="title-cell">${escaparHTML(getValue(row, "titol"))}</td>
        <td>${escaparHTML(getValue(row, "dataInici"))}</td>
        <td>${escaparHTML(getValue(row, "categoria"))}</td>
        <td>${escaparHTML(getValue(row, "espai"))}</td>
        <td>${linkCell}</td>
      </tr>
    `;
  }).join("");
}

/* =========================
   CALENDARI
========================= */

function inicialitzarCalendari(allRows, autoRows) {
  PRO_CALENDAR_ROWS = allRows || [];
  PRO_CALENDAR_AUTOGESTIONADES = autoRows || [];

  const firstDate = PRO_CALENDAR_ROWS
    .map(row => parseCalendarDate(getValue(row, "dataInici")))
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
      if (row) renderProfessionalCalendarDetail(row);
    });
    grid.dataset.bound = "1";
  }

  if (modeToggle && !modeToggle.dataset.bound) {
    modeToggle.addEventListener("click", event => {
      const button = event.target.closest("[data-calendar-mode]");
      if (!button) return;

      PRO_CALENDAR_MODE = button.dataset.calendarMode;

      const dates = getProfessionalCalendarWorkingRows()
        .map(row => parseCalendarDate(getValue(row, "dataInici")))
        .filter(Boolean)
        .sort((a, b) => a - b);

      if (dates.length) {
        PRO_CALENDAR_YEAR = dates[0].getFullYear();
        PRO_CALENDAR_MONTH = dates[0].getMonth();
      }

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

  const workingRows = getProfessionalCalendarWorkingRows();
  const events = getProfessionalCalendarEvents(PRO_CALENDAR_YEAR, PRO_CALENDAR_MONTH);

  if (subtitle) {
    const labelMode = PRO_CALENDAR_MODE === "auto" ? "autogestionades" : "totals";
    subtitle.textContent = `${events.length} activitats ${labelMode} aquest mes · ${workingRows.length} activitats en total`;
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

    if (!eventsByDay.has(day)) eventsByDay.set(day, []);

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
      const idIntern = getValue(item.row, "idIntern") || "";
      const titol = getValue(item.row, "titol") || "Sense títol";

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
    .map(row => ({
      row,
      date: parseCalendarDate(getValue(row, "dataInici"))
    }))
    .filter(item =>
      item.date &&
      item.date.getFullYear() === year &&
      item.date.getMonth() === month
    )
    .sort((a, b) => {
      const dateDiff = a.date - b.date;
      if (dateDiff !== 0) return dateDiff;

      return String(getValue(a.row, "horaInici")).localeCompare(
        String(getValue(b.row, "horaInici"))
      );
    });
}

function renderProfessionalCalendarDetail(row) {
  const detail = document.getElementById("pro-calendar-detail");
  if (!detail) return;

  const enllac = getValue(row, "enllacInscripcions");

  const linkHtml = enllac
    ? `<a class="detail-link" href="${escaparAtribut(enllac)}" target="_blank" rel="noopener noreferrer">Obrir enllaç d'inscripcions</a>`
    : `<span class="warning-pill">Falta enllaç d'inscripcions</span>`;

  detail.innerHTML = `
    <span class="detail-eyebrow">Detall activitat</span>
    <h3>${escaparHTML(getValue(row, "titol") || "Sense títol")}</h3>

    <div class="detail-list">
      ${detailItem("ID intern", getValue(row, "idIntern"))}
      ${detailItem("Encarregada", getValue(row, "responsable"))}
      ${detailItem("Títol activitat", getValue(row, "titol"))}
      ${detailItem("Modalitat", getValue(row, "modalitat"))}
      ${detailItem("Data inici", getValue(row, "dataInici"))}
      ${detailItem("Hora inici", getValue(row, "horaInici"))}
      ${detailItem("Categoria", getValue(row, "categoria"))}
      ${detailItem("Espai", getValue(row, "espai"))}
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

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  return null;
}

/* =========================
   MAPA
========================= */

async function renderitzarMapaAutogestionades() {
  const mapStatus = document.getElementById("map-status");
  const mapCounter = document.getElementById("map-counter");
  const mapEl = document.getElementById("autogestionades-map");

  if (!mapEl || typeof L === "undefined") return;

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
    const espaiOriginal = getValue(row, "espai");
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
      titol: getValue(row, "titol") || "Sense títol",
      data: getValue(row, "dataInici") || ""
    });
  });

  return [...grouped.values()];
}

function esDistricte(value) {
  return DISTRICTES_EXCLOSOS.includes(normalitzarText(value));
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
      headers: { "Accept": "application/json" }
    });

    if (!response.ok) return null;

    const results = await response.json();
    if (!results.length) return null;

    const coords = {
      lat: Number(results[0].lat),
      lng: Number(results[0].lon)
    };

    cache[cacheKey] = coords;
    guardarGeocache(cache);

    await sleep(250);
    return coords;
  } catch {
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

/* =========================
   HELPERS
========================= */

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


/* =========================
   ANIMACIÓ LOGO CAPITALITAT
========================= */

function activarAnimacioLogoCapitalitat() {
  const logoTrigger = document.querySelector(".brand-block") || document.querySelector(".brand-logo");

  if (!logoTrigger) return;

  logoTrigger.style.cursor = "pointer";
  logoTrigger.setAttribute("title", "Veure progrés de la Capitalitat");

  logoTrigger.addEventListener("click", () => {
    mostrarAnimacioCapitalitat();
  });
}

function mostrarAnimacioCapitalitat() {
  let overlay = document.getElementById("capitalitat-progress-overlay");

  if (!overlay) {
    overlay = crearOverlayCapitalitat();
    document.body.appendChild(overlay);
  }

  const progress = calcularProgresCapitalitat();
  const percentText = overlay.querySelector("[data-capitalitat-percent]");
  const daysText = overlay.querySelector("[data-capitalitat-days]");
  const circle = overlay.querySelector("[data-capitalitat-circle]");

  if (percentText) {
    percentText.textContent = `${progress.percent}%`;
  }

  if (daysText) {
    if (progress.remainingDays > 0) {
      daysText.textContent = `Falten ${progress.remainingDays} dies per acabar la Capitalitat`;
    } else if (progress.percent >= 100) {
      daysText.textContent = "La Capitalitat ha finalitzat";
    } else {
      daysText.textContent = "La Capitalitat encara no ha començat";
    }
  }

  if (circle) {
    const radius = Number(circle.getAttribute("r"));
    const circumference = 2 * Math.PI * radius;

    circle.style.strokeDasharray = `${circumference}`;
    circle.style.strokeDashoffset = `${circumference}`;
  }

  overlay.classList.remove("is-active", "show-progress", "draw-circle");

  requestAnimationFrame(() => {
    overlay.classList.add("is-active");
  });

  // Primer: línia + dates. Després apareix el percentatge.
  window.setTimeout(() => {
    overlay.classList.add("show-progress");
  }, 3900);

  // Primer apareix el %. Després es comença a omplir la rodona.
  window.setTimeout(() => {
    if (circle) {
      const radius = Number(circle.getAttribute("r"));
      const circumference = 2 * Math.PI * radius;
      const offset = circumference - (progress.percent / 100) * circumference;
      circle.style.strokeDashoffset = `${offset}`;
    }

    overlay.classList.add("draw-circle");
  }, 4650);
}

function crearOverlayCapitalitat() {
  const overlay = document.createElement("div");
  overlay.id = "capitalitat-progress-overlay";
  overlay.className = "capitalitat-overlay";
  overlay.setAttribute("aria-hidden", "true");

  overlay.innerHTML = `
    <button class="capitalitat-close" type="button" aria-label="Tancar animació">×</button>

    <div class="capitalitat-sequence">
      <div class="capitalitat-line-stage">
        <span class="capitalitat-date capitalitat-date-left">12 de febrer</span>
        <span class="capitalitat-date capitalitat-date-right">13 de desembre</span>
        <span class="capitalitat-line"></span>
      </div>

      <div class="capitalitat-progress-stage">
        <div class="capitalitat-progress-ring">
          <svg viewBox="0 0 220 220" aria-hidden="true">
            <circle class="capitalitat-ring-bg" cx="110" cy="110" r="92"></circle>
            <circle class="capitalitat-ring-progress" cx="110" cy="110" r="92" data-capitalitat-circle></circle>
          </svg>

          <div class="capitalitat-progress-number">
            <strong data-capitalitat-percent>—</strong>
            <span>dies transcorreguts</span>
          </div>
        </div>

        <p data-capitalitat-days>Calculant dies restants...</p>
      </div>
    </div>
  `;

  overlay.addEventListener("click", event => {
    if (
      event.target === overlay ||
      event.target.closest(".capitalitat-close")
    ) {
      tancarAnimacioCapitalitat();
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      tancarAnimacioCapitalitat();
    }
  });

  return overlay;
}

function tancarAnimacioCapitalitat() {
  const overlay = document.getElementById("capitalitat-progress-overlay");
  if (!overlay) return;

  overlay.classList.remove("is-active", "show-progress");
}

function calcularProgresCapitalitat() {
  const MS_DIA = 24 * 60 * 60 * 1000;

  const inici = new Date(2026, 1, 12);
  const final = new Date(2026, 11, 13);

  const ara = new Date();
  const avui = new Date(ara.getFullYear(), ara.getMonth(), ara.getDate());

  const totalDies = Math.max(1, Math.round((final - inici) / MS_DIA));
  const diesPassats = Math.round((avui - inici) / MS_DIA);
  const remainingDays = Math.max(0, Math.ceil((final - avui) / MS_DIA));

  const percent = Math.min(100, Math.max(0, Math.round((diesPassats / totalDies) * 100)));

  return {
    percent,
    remainingDays
  };
}


/* =========================
   INTRO AUTOMÀTICA CAPITALITAT
========================= */

function activarIntroInicialCapitalitat() {
  // Petita pausa perquè la web acabi d'aparèixer abans de la intro
  window.setTimeout(() => {
    mostrarIntroInicialCapitalitat();
  }, 450);
}

function mostrarIntroInicialCapitalitat() {
  if (document.body.dataset.capitalitatIntroActive === "1") return;

  document.body.dataset.capitalitatIntroActive = "1";

  const intro = document.createElement("div");
  intro.id = "capitalitat-intro-overlay";
  intro.className = "capitalitat-intro-overlay";
  intro.setAttribute("aria-hidden", "true");

  intro.innerHTML = `
    <div class="capitalitat-intro-light"></div>

    <div class="capitalitat-intro-title">
      <span>Barcelona 2026</span>
      <strong>Capital Mundial de l'Arquitectura</strong>
    </div>
  `;

  document.body.appendChild(intro);

  requestAnimationFrame(() => {
    intro.classList.add("is-active");
  });

  // Quan la llum arriba al centre, apareix el text
  window.setTimeout(() => {
    intro.classList.add("show-title");
  }, 2550);

  // Desapareix la intro
  window.setTimeout(() => {
    intro.classList.add("is-leaving");
  }, 4300);

  // S'elimina la intro i comença l'animació de la línia + percentatge
  window.setTimeout(() => {
    intro.remove();
    document.body.dataset.capitalitatIntroActive = "0";
    mostrarAnimacioCapitalitat();
  }, 5050);
}



/* ============================================================
   ANIMACIÓ ÚNICA FINAL · BARCELONA 2026
   Llumeta → títol → línia → dates → percentatge
============================================================ */

function activarAnimacioLogoCapitalitat() {
  const logoTrigger = document.querySelector(".brand-block") || document.querySelector(".brand-logo");

  if (!logoTrigger) return;

  logoTrigger.style.cursor = "pointer";
  logoTrigger.setAttribute("title", "Veure progrés de la Capitalitat");

  if (!logoTrigger.dataset.capitalitatFinalBound) {
    logoTrigger.addEventListener("click", () => {
      mostrarExperienciaCapitalitatFinal();
    });

    logoTrigger.dataset.capitalitatFinalBound = "1";
  }
}

function activarIntroInicialCapitalitat() {
  window.setTimeout(() => {
    mostrarExperienciaCapitalitatFinal();
  }, 650);
}

// Si alguna funció antiga crida aquests noms, també redirigim aquí.
function mostrarAnimacioCapitalitat() {
  mostrarExperienciaCapitalitatFinal();
}

function mostrarIntroInicialCapitalitat() {
  mostrarExperienciaCapitalitatFinal();
}

function mostrarExperienciaCapitalitatFinal() {
  document.querySelectorAll(
    "#capitalitat-progress-overlay, #capitalitat-intro-overlay, #capitalitat-cinematic-overlay, #capitalitat-final-overlay"
  ).forEach(element => element.remove());

  const progress = calcularProgresCapitalitat();

  const overlay = document.createElement("div");
  overlay.id = "capitalitat-final-overlay";
  overlay.className = "capitalitat-final-overlay";
  overlay.setAttribute("aria-hidden", "true");

  overlay.innerHTML = `
    <button class="final-close" type="button" aria-label="Tancar animació">×</button>

    <div class="final-light"></div>

    <div class="final-title">
      <span>Barcelona 2026</span>
      <strong>Capital Mundial de l'Arquitectura</strong>
    </div>

    <div class="final-timeline">
      <span class="final-date final-date-left">12 de febrer</span>
      <span class="final-date final-date-right">13 de desembre</span>
      <span class="final-line"></span>
    </div>

    <div class="final-progress">
      <div class="final-ring">
        <svg viewBox="0 0 220 220" aria-hidden="true">
          <circle class="final-ring-bg" cx="110" cy="110" r="92"></circle>
          <circle class="final-ring-progress" cx="110" cy="110" r="92" data-final-circle></circle>
        </svg>

        <div class="final-number">
          <strong>${progress.percent}%</strong>
          <span>dies transcorreguts</span>
        </div>
      </div>

      <p>${progress.remainingDays > 0 ? `Falten ${progress.remainingDays} dies per acabar la Capitalitat` : "La Capitalitat ha finalitzat"}</p>
    </div>
  `;

  document.body.appendChild(overlay);

  const circle = overlay.querySelector("[data-final-circle]");

  if (circle) {
    const radius = Number(circle.getAttribute("r"));
    const circumference = 2 * Math.PI * radius;
    circle.style.strokeDasharray = `${circumference}`;
    circle.style.strokeDashoffset = `${circumference}`;
  }

  overlay.addEventListener("click", event => {
    if (event.target === overlay || event.target.closest(".final-close")) {
      overlay.classList.add("is-closing");
      window.setTimeout(() => overlay.remove(), 550);
    }
  });

  requestAnimationFrame(() => {
    overlay.classList.add("is-active");
  });

  // Primer apareix el percentatge. Després s'omple la rodona.
  window.setTimeout(() => {
    if (!circle) return;

    const radius = Number(circle.getAttribute("r"));
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (progress.percent / 100) * circumference;

    circle.style.strokeDashoffset = `${offset}`;
  }, 10300);
}

function calcularProgresCapitalitat() {
  const MS_DIA = 24 * 60 * 60 * 1000;

  const inici = new Date(2026, 1, 12);
  const final = new Date(2026, 11, 13);

  const ara = new Date();
  const avui = new Date(ara.getFullYear(), ara.getMonth(), ara.getDate());

  const totalDies = Math.max(1, Math.round((final - inici) / MS_DIA));
  const diesPassats = Math.round((avui - inici) / MS_DIA);
  const remainingDays = Math.max(0, Math.ceil((final - avui) / MS_DIA));

  const percent = Math.min(100, Math.max(0, Math.round((diesPassats / totalDies) * 100)));

  return {
    percent,
    remainingDays
  };
}


/* === CAPITALITAT_V4_START === */

/* ============================================================
   CAPITALITAT V4 · LOGO OFICIAL + RAIG DE LLUM + COL·LAPSE
============================================================ */

window.addEventListener("load", () => {
  try {
    activarAnimacioLogoCapitalitat();
    activarIntroInicialCapitalitat();
  } catch (e) {
    console.error("Capitalitat V4 init error:", e);
  }
});

function activarAnimacioLogoCapitalitat() {
  const logoTrigger = document.querySelector(".brand-block") || document.querySelector(".brand-logo");
  if (!logoTrigger) return;

  logoTrigger.style.cursor = "pointer";
  logoTrigger.setAttribute("title", "Veure progrés de la Capitalitat");

  if (!logoTrigger.dataset.capitalitatV4Bound) {
    logoTrigger.addEventListener("click", () => {
      mostrarExperienciaCapitalitatV4();
    });
    logoTrigger.dataset.capitalitatV4Bound = "1";
  }
}

function activarIntroInicialCapitalitat() {
  if (window.__capitalitatV4IntroDone) return;
  window.__capitalitatV4IntroDone = true;

  window.setTimeout(() => {
    mostrarExperienciaCapitalitatV4();
  }, 650);
}

function mostrarAnimacioCapitalitat() { mostrarExperienciaCapitalitatV4(); }
function mostrarIntroInicialCapitalitat() { mostrarExperienciaCapitalitatV4(); }
function mostrarExperienciaCapitalitatFinal() { mostrarExperienciaCapitalitatV4(); }
function mostrarExperienciaCapitalitatV3() { mostrarExperienciaCapitalitatV4(); }

function mostrarExperienciaCapitalitatV4() {
  document.querySelectorAll(
    "#capitalitat-progress-overlay, #capitalitat-intro-overlay, #capitalitat-cinematic-overlay, #capitalitat-final-overlay, #capitalitat-v3-overlay, #capitalitat-v4-overlay"
  ).forEach(el => el.remove());

  const progress = calcularProgresCapitalitat();

  const overlay = document.createElement("div");
  overlay.id = "capitalitat-v4-overlay";
  overlay.className = "capitalitat-v4-overlay";
  overlay.innerHTML = `
    <button class="cv4-close" type="button" aria-label="Tancar animació">×</button>

    <div class="cv4-logo-stage">
      <div class="cv4-logo-single"></div>
    </div>

    <div class="cv4-seed"></div>

    <div class="cv4-timeline">
      <span class="cv4-date cv4-date-left">12 de febrer</span>
      <span class="cv4-date cv4-date-right">13 de desembre</span>
      <span class="cv4-line"></span>
    </div>

    <div class="cv4-progress">
      <div class="cv4-ring">
        <svg viewBox="0 0 220 220" aria-hidden="true">
          <circle class="cv4-ring-bg" cx="110" cy="110" r="92"></circle>
          <circle class="cv4-ring-progress" cx="110" cy="110" r="92" data-cv4-circle></circle>
        </svg>

        <div class="cv4-number">
          <strong data-cv4-number>0%</strong>
          <span>dies transcorreguts</span>
        </div>
      </div>

      <p>${progress.remainingDays > 0 ? `Falten ${progress.remainingDays} dies per acabar la Capitalitat` : "La Capitalitat ha finalitzat"}</p>
    </div>
  `;

  document.body.appendChild(overlay);

  const circle = overlay.querySelector("[data-cv4-circle]");
  const numberEl = overlay.querySelector("[data-cv4-number]");

  if (circle) {
    const radius = Number(circle.getAttribute("r"));
    const circumference = 2 * Math.PI * radius;
    circle.style.strokeDasharray = `${circumference}`;
    circle.style.strokeDashoffset = `${circumference}`;
  }

  overlay.addEventListener("click", event => {
    if (event.target === overlay || event.target.closest(".cv4-close")) {
      overlay.classList.add("is-closing");
      window.setTimeout(() => overlay.remove(), 550);
    }
  });

  requestAnimationFrame(() => {
    overlay.classList.add("is-active");
  });

  // Quan ja apareix el bloc del progrés, el número puja de 0 al percentatge real
  window.setTimeout(() => {
    animarPercentatgeCapitalitatV4(numberEl, circle, progress.percent, 1700);
  }, 7600);
}

function animarPercentatgeCapitalitatV4(numberEl, circleEl, targetPercent, duration = 1700) {
  const start = performance.now();

  let circumference = 0;
  if (circleEl) {
    const radius = Number(circleEl.getAttribute("r"));
    circumference = 2 * Math.PI * radius;
    circleEl.style.strokeDasharray = `${circumference}`;
    circleEl.style.strokeDashoffset = `${circumference}`;
  }

  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const current = Math.round(targetPercent * eased);

    if (numberEl) numberEl.textContent = `${current}%`;

    if (circleEl) {
      const offset = circumference - (current / 100) * circumference;
      circleEl.style.strokeDashoffset = `${offset}`;
    }

    if (t < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

function calcularProgresCapitalitat() {
  const MS_DIA = 24 * 60 * 60 * 1000;

  const inici = new Date(2026, 1, 12);
  const final = new Date(2026, 11, 13);

  const ara = new Date();
  const avui = new Date(ara.getFullYear(), ara.getMonth(), ara.getDate());

  const totalDies = Math.max(1, Math.round((final - inici) / MS_DIA));
  const diesPassats = Math.round((avui - inici) / MS_DIA);
  const remainingDays = Math.max(0, Math.ceil((final - avui) / MS_DIA));
  const percent = Math.min(100, Math.max(0, Math.round((diesPassats / totalDies) * 100)));

  return { percent, remainingDays };
}

/* === CAPITALITAT_V5_START === */

/* ============================================================
   CAPITALITAT V5 · PERÍMETRE + 3 PUNTS + FUSIÓ
============================================================ */

window.addEventListener("load", () => {
  try {
    activarAnimacioLogoCapitalitat();
    activarIntroInicialCapitalitat();
  } catch (e) {
    console.error("Capitalitat V5 init error:", e);
  }
});

function activarAnimacioLogoCapitalitat() {
  const logoTrigger = document.querySelector(".brand-block") || document.querySelector(".brand-logo");
  if (!logoTrigger) return;

  logoTrigger.style.cursor = "pointer";
  logoTrigger.setAttribute("title", "Veure progrés de la Capitalitat");

  if (!logoTrigger.dataset.capitalitatV5Bound) {
    logoTrigger.addEventListener("click", () => {
      mostrarExperienciaCapitalitatV5();
    });
    logoTrigger.dataset.capitalitatV5Bound = "1";
  }
}

function activarIntroInicialCapitalitat() {
  if (window.__capitalitatV5IntroDone) return;
  window.__capitalitatV5IntroDone = true;

  window.setTimeout(() => {
    mostrarExperienciaCapitalitatV5();
  }, 650);
}

/* Compatibilitat amb versions anteriors */
function mostrarAnimacioCapitalitat() { mostrarExperienciaCapitalitatV5(); }
function mostrarIntroInicialCapitalitat() { mostrarExperienciaCapitalitatV5(); }
function mostrarExperienciaCapitalitatFinal() { mostrarExperienciaCapitalitatV5(); }
function mostrarExperienciaCapitalitatV3() { mostrarExperienciaCapitalitatV5(); }
function mostrarExperienciaCapitalitatV4() { mostrarExperienciaCapitalitatV5(); }

function mostrarExperienciaCapitalitatV5() {
  document.querySelectorAll(
    "#capitalitat-progress-overlay, #capitalitat-intro-overlay, #capitalitat-cinematic-overlay, #capitalitat-final-overlay, #capitalitat-v3-overlay, #capitalitat-v4-overlay, #capitalitat-v5-overlay"
  ).forEach(el => el.remove());

  const progress = calcularProgresCapitalitat();

  const overlay = document.createElement("div");
  overlay.id = "capitalitat-v5-overlay";
  overlay.className = "capitalitat-v5-overlay";

  overlay.innerHTML = `
    <button class="cv5-close" type="button" aria-label="Tancar animació">×</button>

    <div class="cv5-logo-area">
      <svg class="cv5-logo-svg" viewBox="0 0 620 760" aria-hidden="true">
        <!-- Path 1: perímetre principal -->
        <path class="cv5-path-base" d="
          M 80 70
          H 240
          L 305 135
          L 370 70
          H 530
          L 590 130
          V 300
          L 510 380
          H 590
          V 465
          H 500
          L 590 555
          V 655
          L 530 715
          H 370
          L 305 650
          V 520
          L 240 585
          H 80
          V 485
          L 155 410
          H 80
          V 305
          L 155 230
          H 80
          Z" />

        <path class="cv5-path-draw" data-cv5-path-1 d="
          M 80 70
          H 240
          L 305 135
          L 370 70
          H 530
          L 590 130
          V 300
          L 510 380
          H 590
          V 465
          H 500
          L 590 555
          V 655
          L 530 715
          H 370
          L 305 650
          V 520
          L 240 585
          H 80
          V 485
          L 155 410
          H 80
          V 305
          L 155 230
          H 80
          Z" />

        <!-- Path 2: rombe central -->
        <path class="cv5-path-base" d="
          M 305 285
          L 395 375
          L 305 465
          L 215 375
          Z" />

        <path class="cv5-path-draw" data-cv5-path-2 d="
          M 305 285
          L 395 375
          L 305 465
          L 215 375
          Z" />

        <!-- Path 3: triangles interiors -->
        <path class="cv5-path-base" d="
          M 225 245
          L 305 165
          V 285
          Z
          M 225 545
          L 305 465
          V 585
          Z" />

        <path class="cv5-path-draw" data-cv5-path-3 d="
          M 225 245
          L 305 165
          V 285
          Z
          M 225 545
          L 305 465
          V 585
          Z" />

        <circle class="cv5-dot cv5-dot-1" data-cv5-dot-1 cx="0" cy="0" r="5"></circle>
        <circle class="cv5-dot cv5-dot-2" data-cv5-dot-2 cx="0" cy="0" r="5"></circle>
        <circle class="cv5-dot cv5-dot-3" data-cv5-dot-3 cx="0" cy="0" r="5"></circle>
      </svg>

      <div class="cv5-brand-copy cv5-brand-copy-svg">
        <img src="assets/lletres-fill.svg" alt="Barcelona 2026 Capital Mundial de l'Arquitectura">
      </div>
    </div>

    <div class="cv5-seed"></div>

    <div class="cv5-timeline">
      <span class="cv5-date cv5-date-left">12 de febrer</span>
      <span class="cv5-date cv5-date-right">13 de desembre</span>
      <span class="cv5-line"></span>
    </div>

    <div class="cv5-progress">
      <div class="cv5-ring">
        <svg viewBox="0 0 220 220" aria-hidden="true">
          <circle class="cv5-ring-bg" cx="110" cy="110" r="92"></circle>
          <circle class="cv5-ring-progress" cx="110" cy="110" r="92" data-cv5-circle></circle>
        </svg>

        <div class="cv5-number">
          <strong data-cv5-number>0%</strong>
          <span>dies transcorreguts</span>
        </div>
      </div>

      <p>${progress.remainingDays > 0 ? `Falten ${progress.remainingDays} dies per acabar la Capitalitat` : "La Capitalitat ha finalitzat"}</p>
    </div>
  `;

  document.body.appendChild(overlay);

  const circle = overlay.querySelector("[data-cv5-circle]");
  if (circle) {
    const radius = Number(circle.getAttribute("r"));
    const circumference = 2 * Math.PI * radius;
    circle.style.strokeDasharray = `${circumference}`;
    circle.style.strokeDashoffset = `${circumference}`;
  }

  overlay.addEventListener("click", event => {
    if (event.target === overlay || event.target.closest(".cv5-close")) {
      overlay.classList.add("is-closing");
      window.setTimeout(() => overlay.remove(), 550);
    }
  });

  requestAnimationFrame(() => {
    overlay.classList.add("is-active");
    animarPerimetreCapitalitatV5(overlay, progress);
  });
}

function animarPerimetreCapitalitatV5(overlay, progress) {
  const path1 = overlay.querySelector("[data-cv5-path-1]");
  const path2 = overlay.querySelector("[data-cv5-path-2]");
  const path3 = overlay.querySelector("[data-cv5-path-3]");

  const dot1 = overlay.querySelector("[data-cv5-dot-1]");
  const dot2 = overlay.querySelector("[data-cv5-dot-2]");
  const dot3 = overlay.querySelector("[data-cv5-dot-3]");

  const numberEl = overlay.querySelector("[data-cv5-number]");
  const circleEl = overlay.querySelector("[data-cv5-circle]");

  const svg = overlay.querySelector(".cv5-logo-svg");

  const len1 = path1.getTotalLength();
  const len2 = path2.getTotalLength();
  const len3 = path3.getTotalLength();

  prepararPath(path1, len1);
  prepararPath(path2, len2);
  prepararPath(path3, len3);

  posicionarDot(path1, dot1, 0, len1);
  posicionarDot(path2, dot2, 0, len2);
  posicionarDot(path3, dot3, 0, len3);

  const start = performance.now();
  const duration = 2500;

  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 2.4);

    pintarPath(path1, len1, eased);
    pintarPath(path2, len2, Math.min(1, eased * 1.05));
    pintarPath(path3, len3, Math.min(1, eased * 1.08));

    posicionarDot(path1, dot1, eased, len1);
    posicionarDot(path2, dot2, Math.min(1, eased * 1.05), len2);
    posicionarDot(path3, dot3, Math.min(1, eased * 1.08), len3);

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      overlay.classList.add("is-copy-visible");

      window.setTimeout(() => {
        fusionarPuntsCapitalitatV5(overlay, [dot1, dot2, dot3], { x: 305, y: 375 }, () => {
          overlay.classList.add("is-seed-visible");

          window.setTimeout(() => {
            overlay.classList.add("is-timeline-start");
          }, 250);

          window.setTimeout(() => {
            overlay.classList.add("is-progress-visible");
          }, 2400);

          window.setTimeout(() => {
            animarPercentatgeCapitalitatV5(numberEl, circleEl, progress.percent, 1700);
          }, 2700);
        });
      }, 850);
    }
  }

  requestAnimationFrame(frame);
}

function prepararPath(path, length) {
  path.style.strokeDasharray = `${length}`;
  path.style.strokeDashoffset = `${length}`;
}

function pintarPath(path, length, progress) {
  const drawn = Math.max(0, Math.min(length, length * progress));
  path.style.strokeDashoffset = `${length - drawn}`;
}

function posicionarDot(path, dot, progress, length) {
  const clamped = Math.max(0, Math.min(1, progress));
  const point = path.getPointAtLength(length * clamped);

  dot.setAttribute("cx", point.x.toFixed(2));
  dot.setAttribute("cy", point.y.toFixed(2));
  dot.style.opacity = clamped > 0.01 ? "1" : "0";
}

function fusionarPuntsCapitalitatV5(overlay, dots, target, onComplete) {
  const startPoints = dots.map(dot => ({
    dot,
    x: Number(dot.getAttribute("cx")),
    y: Number(dot.getAttribute("cy"))
  }));

  const start = performance.now();
  const duration = 900;

  overlay.classList.add("is-merging");

  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);

    startPoints.forEach(({ dot, x, y }) => {
      const nx = x + (target.x - x) * eased;
      const ny = y + (target.y - y) * eased;

      dot.setAttribute("cx", nx.toFixed(2));
      dot.setAttribute("cy", ny.toFixed(2));

      if (t > 0.7) {
        dot.style.opacity = String(1 - (t - 0.7) / 0.3);
      }
    });

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      startPoints.forEach(({ dot }) => {
        dot.style.opacity = "0";
      });

      overlay.classList.add("is-logo-fading");

      if (typeof onComplete === "function") onComplete();
    }
  }

  requestAnimationFrame(frame);
}

function animarPercentatgeCapitalitatV5(numberEl, circleEl, targetPercent, duration = 1700) {
  const start = performance.now();

  let circumference = 0;
  if (circleEl) {
    const radius = Number(circleEl.getAttribute("r"));
    circumference = 2 * Math.PI * radius;
    circleEl.style.strokeDasharray = `${circumference}`;
    circleEl.style.strokeDashoffset = `${circumference}`;
  }

  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const current = Math.round(targetPercent * eased);

    if (numberEl) numberEl.textContent = `${current}%`;

    if (circleEl) {
      const offset = circumference - (current / 100) * circumference;
      circleEl.style.strokeDashoffset = `${offset}`;
    }

    if (t < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

function calcularProgresCapitalitat() {
  const MS_DIA = 24 * 60 * 60 * 1000;

  const inici = new Date(2026, 1, 12);
  const final = new Date(2026, 11, 13);

  const ara = new Date();
  const avui = new Date(ara.getFullYear(), ara.getMonth(), ara.getDate());

  const totalDies = Math.max(1, Math.round((final - inici) / MS_DIA));
  const diesPassats = Math.round((avui - inici) / MS_DIA);
  const remainingDays = Math.max(0, Math.ceil((final - avui) / MS_DIA));
  const percent = Math.min(100, Math.max(0, Math.round((diesPassats / totalDies) * 100)));

  return { percent, remainingDays };
}

/* === CAPITALITAT_V5_TUNE_START === */

/* ============================================================
   CAPITALITAT V5 · AJUST FI
   Perímetre més acurat + text + fusió més suau
============================================================ */

function mostrarExperienciaCapitalitatV5() {
  document.querySelectorAll(
    "#capitalitat-progress-overlay, #capitalitat-intro-overlay, #capitalitat-cinematic-overlay, #capitalitat-final-overlay, #capitalitat-v3-overlay, #capitalitat-v4-overlay, #capitalitat-v5-overlay"
  ).forEach(el => el.remove());

  const progress = calcularProgresCapitalitat();

  const outerPath = `
    M 92 96
    L 170 22
    H 266
    L 320 76
    L 374 22
    H 470
    L 548 98
    V 270
    L 470 348
    H 548
    V 446
    H 470
    L 548 524
    V 636
    L 470 714
    H 374
    L 320 660
    V 532
    L 266 586
    H 92
    V 500
    L 164 428
    H 92
    V 324
    L 164 252
    H 92
    Z
  `;

  const centerPath = `
    M 320 298
    L 394 372
    L 320 446
    L 246 372
    Z
  `;

  const innerPath = `
    M 214 248
    L 320 142
    V 284
    Z
    M 214 496
    L 320 390
    V 532
    Z
  `;

  const overlay = document.createElement("div");
  overlay.id = "capitalitat-v5-overlay";
  overlay.className = "capitalitat-v5-overlay";

  overlay.innerHTML = `
    <button class="cv5-close" type="button" aria-label="Tancar animació">×</button>

    <div class="cv5-logo-area">
      <svg class="cv5-logo-svg" viewBox="0 0 640 740" aria-hidden="true">
        <path class="cv5-path-base" d="${outerPath}" />
        <path class="cv5-path-draw" data-cv5-path-1 d="${outerPath}" />

        <path class="cv5-path-base" d="${centerPath}" />
        <path class="cv5-path-draw" data-cv5-path-2 d="${centerPath}" />

        <path class="cv5-path-base" d="${innerPath}" />
        <path class="cv5-path-draw" data-cv5-path-3 d="${innerPath}" />

        <circle class="cv5-dot cv5-dot-1" data-cv5-dot-1 cx="0" cy="0" r="5"></circle>
        <circle class="cv5-dot cv5-dot-2" data-cv5-dot-2 cx="0" cy="0" r="5"></circle>
        <circle class="cv5-dot cv5-dot-3" data-cv5-dot-3 cx="0" cy="0" r="5"></circle>
      </svg>

      <div class="cv5-brand-copy cv5-brand-copy-svg">
        <img src="assets/lletres-fill.svg" alt="Barcelona 2026 Capital Mundial de l'Arquitectura">
      </div>
    </div>

    <div class="cv5-seed"></div>

    <div class="cv5-timeline">
      <span class="cv5-date cv5-date-left">12 de febrer</span>
      <span class="cv5-date cv5-date-right">13 de desembre</span>
      <span class="cv5-line"></span>
    </div>

    <div class="cv5-progress">
      <div class="cv5-ring">
        <svg viewBox="0 0 220 220" aria-hidden="true">
          <circle class="cv5-ring-bg" cx="110" cy="110" r="92"></circle>
          <circle class="cv5-ring-progress" cx="110" cy="110" r="92" data-cv5-circle></circle>
        </svg>

        <div class="cv5-number">
          <strong data-cv5-number>0%</strong>
          <span>dies transcorreguts</span>
        </div>
      </div>

      <p>${progress.remainingDays > 0 ? `Falten ${progress.remainingDays} dies per acabar la Capitalitat` : "La Capitalitat ha finalitzat"}</p>
    </div>
  `;

  document.body.appendChild(overlay);

  const circle = overlay.querySelector("[data-cv5-circle]");
  if (circle) {
    const radius = Number(circle.getAttribute("r"));
    const circumference = 2 * Math.PI * radius;
    circle.style.strokeDasharray = `${circumference}`;
    circle.style.strokeDashoffset = `${circumference}`;
  }

  overlay.addEventListener("click", event => {
    if (event.target === overlay || event.target.closest(".cv5-close")) {
      overlay.classList.add("is-closing");
      window.setTimeout(() => overlay.remove(), 550);
    }
  });

  requestAnimationFrame(() => {
    overlay.classList.add("is-active");
    animarPerimetreCapitalitatV5(overlay, progress);
  });
}

function animarPerimetreCapitalitatV5(overlay, progress) {
  const path1 = overlay.querySelector("[data-cv5-path-1]");
  const path2 = overlay.querySelector("[data-cv5-path-2]");
  const path3 = overlay.querySelector("[data-cv5-path-3]");

  const dot1 = overlay.querySelector("[data-cv5-dot-1]");
  const dot2 = overlay.querySelector("[data-cv5-dot-2]");
  const dot3 = overlay.querySelector("[data-cv5-dot-3]");

  const numberEl = overlay.querySelector("[data-cv5-number]");
  const circleEl = overlay.querySelector("[data-cv5-circle]");

  const len1 = path1.getTotalLength();
  const len2 = path2.getTotalLength();
  const len3 = path3.getTotalLength();

  prepararPath(path1, len1);
  prepararPath(path2, len2);
  prepararPath(path3, len3);

  posicionarDot(path1, dot1, 0, len1);
  posicionarDot(path2, dot2, 0, len2);
  posicionarDot(path3, dot3, 0, len3);

  const start = performance.now();
  const duration = 3400;
  let copyShown = false;

  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 2.2);

    pintarPath(path1, len1, eased);
    pintarPath(path2, len2, Math.min(1, eased * 1.08));
    pintarPath(path3, len3, Math.min(1, eased * 1.12));

    posicionarDot(path1, dot1, eased, len1);
    posicionarDot(path2, dot2, Math.min(1, eased * 1.08), len2);
    posicionarDot(path3, dot3, Math.min(1, eased * 1.12), len3);

    if (!copyShown && t > 0.74) {
      overlay.classList.add("is-copy-visible");
      copyShown = true;
    }

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      window.setTimeout(() => {
        overlay.classList.add("is-copy-leaving");

        window.setTimeout(() => {
          fusionarPuntsCapitalitatV5(overlay, [dot1, dot2, dot3], { x: 320, y: 372 }, () => {
            overlay.classList.add("is-seed-visible");

            window.setTimeout(() => {
              overlay.classList.add("is-timeline-start");
            }, 360);

            window.setTimeout(() => {
              overlay.classList.add("is-progress-visible");
            }, 2700);

            window.setTimeout(() => {
              animarPercentatgeCapitalitatV5(numberEl, circleEl, progress.percent, 1650);
            }, 3020);
          });
        }, 620);
      }, 900);
    }
  }

  requestAnimationFrame(frame);
}

function fusionarPuntsCapitalitatV5(overlay, dots, target, onComplete) {
  const startPoints = dots.map(dot => ({
    dot,
    x: Number(dot.getAttribute("cx")),
    y: Number(dot.getAttribute("cy"))
  }));

  const start = performance.now();
  const duration = 1100;

  overlay.classList.add("is-merging");

  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);

    startPoints.forEach(({ dot, x, y }, index) => {
      const delay = index * 0.06;
      const localT = Math.max(0, Math.min(1, (eased - delay) / (1 - delay)));
      const nx = x + (target.x - x) * localT;
      const ny = y + (target.y - y) * localT;

      dot.setAttribute("cx", nx.toFixed(2));
      dot.setAttribute("cy", ny.toFixed(2));

      if (localT > 0.72) {
        dot.style.opacity = String(1 - (localT - 0.72) / 0.28);
      }
    });

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      startPoints.forEach(({ dot }) => {
        dot.style.opacity = "0";
      });

      overlay.classList.add("is-logo-fading");

      window.setTimeout(() => {
        if (typeof onComplete === "function") onComplete();
      }, 220);
    }
  }

  requestAnimationFrame(frame);
}

/* === CAPITALITAT_V5_REAL_SVG_START === */

/* ============================================================
   CAPITALITAT V5 · SVG REAL DEL PERÍMETRE
============================================================ */

function mostrarExperienciaCapitalitatV5() {
  document.querySelectorAll(
    "#capitalitat-progress-overlay, #capitalitat-intro-overlay, #capitalitat-cinematic-overlay, #capitalitat-final-overlay, #capitalitat-v3-overlay, #capitalitat-v4-overlay, #capitalitat-v5-overlay"
  ).forEach(el => el.remove());

  const progress = calcularProgresCapitalitat();

  const logoPath = `
    m 30.399999,286.95971
    v -18.9626
    L 43.679998,254.72
    c 7.304,-7.30241 13.28,-13.38576 13.28,-13.51855
    0,-0.1328 -5.976,-0.24145 -13.28,-0.24145
    H 30.399999
    V 229.19855 217.43711
    L 43.679998,204.16
    c 7.304,-7.30241 13.28,-13.38416 13.28,-13.515
    0,-0.13085 -5.94,-0.2755 -13.2,-0.32145
    l -13.199999,-0.0836
    -0.08215,-18.88
    -0.08215,-18.88
    13.282151,-13.27855
    c 7.305183,-7.30321 13.282153,-13.38561 13.282153,-13.51645
    0,-0.13085 -5.94,-0.2755 -13.2,-0.32145
    L 30.559999,125.28
    30.476183,113.43874
    30.392367,101.59748
    43.924948,88.078736
    57.457527,74.56
    H 73.290192
    89.122854
    L 102.56,88
    c 7.39042,7.392 13.57953,13.44 13.75357,13.44
    0.17403,0 6.37062,-6.048 13.77019,-13.44
    l 13.45376,-13.44
    h 15.83263
    15.83263
    l 13.67861,13.681379
    13.6786,13.681381
    v 30.56005
    30.56005
    l -13.42166,13.4188
    c -7.38191,7.38035 -13.34941,13.5357 -13.26111,13.67857
    0.0883,0.14287 6.12805,0.25977 13.42166,0.25977
    h 13.26111
    v 14.72
    14.72
    h -13.28
    c -7.304,0 -13.28,0.10572 -13.28,0.23494
    0,0.12922 5.976,6.21721 13.28,13.52887
    l 13.28,13.29392
    v 15.99255
    15.99254
    L 189.0386,292.40141
    175.5172,305.92
    H 159.51715
    143.5171
    l -13.27711,-13.28
    c -7.3024,-7.304 -13.38416,-13.28 -13.515,-13.28
    -0.13084,0 -0.27549,5.94 -0.32145,13.2
    l -0.0836,13.2
    -42.959993,0.0812
    -42.959998,0.0812
    z

    m 86.079991,-32.18638
    c 0,-7.18666 -0.10167,-13.16834 -0.22594,-13.29261
    -0.22699,-0.22699 -26.334054,25.66569 -26.334054,26.11782
    0,0.1328 5.976,0.24146 13.280004,0.24146
    h 13.27999
    z

    m 13.52,-77.89357
    -13.36,-13.36306
    -0.16,13.36165
    -0.16,13.36165
    -13.435,0.0836
    -13.434997,0.0836
    13.433587,13.43645
    13.43359,13.43644
    13.52141,-13.5186
    13.52141,-13.51861
    z

    M 116.40354,138.96
    c 0.046,-7.26 -0.0254,-13.2 -0.15855,-13.2
    -0.31842,0 -26.324994,26.00371 -26.324994,26.32209
    0,0.13475 5.94,0.20741 13.200004,0.16146
    l 13.19999,-0.0836
    z
  `;

  const overlay = document.createElement("div");
  overlay.id = "capitalitat-v5-overlay";
  overlay.className = "capitalitat-v5-overlay";

  overlay.innerHTML = `
    <button class="cv5-close" type="button" aria-label="Tancar animació">×</button>

    <div class="cv5-logo-area">
      <svg class="cv5-logo-svg cv5-logo-svg-real" viewBox="0 0 231.03999 390.72" aria-hidden="true">
        <path class="cv5-path-base" d="${logoPath}" />
        <path class="cv5-path-draw" data-cv5-path-1 d="${logoPath}" />

        <circle class="cv5-dot cv5-dot-1" data-cv5-dot-1 cx="0" cy="0" r="4.5"></circle>
        <circle class="cv5-dot cv5-dot-2" data-cv5-dot-2 cx="0" cy="0" r="4.5"></circle>
        <circle class="cv5-dot cv5-dot-3" data-cv5-dot-3 cx="0" cy="0" r="4.5"></circle>
      </svg>

      <div class="cv5-brand-copy cv5-brand-copy-svg">
        <img src="assets/lletres-fill.svg" alt="Barcelona 2026 Capital Mundial de l'Arquitectura">
      </div>
    </div>

    <div class="cv5-seed"></div>

    <div class="cv5-timeline">
      <span class="cv5-date cv5-date-left">12 de febrer</span>
      <span class="cv5-date cv5-date-right">13 de desembre</span>
      <span class="cv5-line"></span>
    </div>

    <div class="cv5-progress">
      <div class="cv5-ring">
        <svg viewBox="0 0 220 220" aria-hidden="true">
          <circle class="cv5-ring-bg" cx="110" cy="110" r="92"></circle>
          <circle class="cv5-ring-progress" cx="110" cy="110" r="92" data-cv5-circle></circle>
        </svg>

        <div class="cv5-number">
          <strong data-cv5-number>0%</strong>
          <span>dies transcorreguts</span>
        </div>
      </div>

      <p>${progress.remainingDays > 0 ? `Falten ${progress.remainingDays} dies per acabar la Capitalitat` : "La Capitalitat ha finalitzat"}</p>
    </div>
  `;

  document.body.appendChild(overlay);

  const circle = overlay.querySelector("[data-cv5-circle]");
  if (circle) {
    const radius = Number(circle.getAttribute("r"));
    const circumference = 2 * Math.PI * radius;
    circle.style.strokeDasharray = `${circumference}`;
    circle.style.strokeDashoffset = `${circumference}`;
  }

  overlay.addEventListener("click", event => {
    if (event.target === overlay || event.target.closest(".cv5-close")) {
      overlay.classList.add("is-closing");
      window.setTimeout(() => overlay.remove(), 550);
    }
  });

  requestAnimationFrame(() => {
    overlay.classList.add("is-active");
    animarPerimetreCapitalitatV5(overlay, progress);
  });
}

function animarPerimetreCapitalitatV5(overlay, progress) {
  const path = overlay.querySelector("[data-cv5-path-1]");

  const dot1 = overlay.querySelector("[data-cv5-dot-1]");
  const dot2 = overlay.querySelector("[data-cv5-dot-2]");
  const dot3 = overlay.querySelector("[data-cv5-dot-3]");

  const numberEl = overlay.querySelector("[data-cv5-number]");
  const circleEl = overlay.querySelector("[data-cv5-circle]");

  const len = path.getTotalLength();
  prepararPath(path, len);

  posicionarDot(path, dot1, 0, len);
  posicionarDot(path, dot2, 0, len);
  posicionarDot(path, dot3, 0, len);

  const start = performance.now();
  const duration = 3600;
  let copyShown = false;

  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 2.15);

    pintarPath(path, len, eased);

    // Tres punts avançant pel mateix perímetre, amb posicions separades
    posicionarDot(path, dot1, eased, len);
    posicionarDot(path, dot2, Math.max(0, eased - 0.12), len);
    posicionarDot(path, dot3, Math.max(0, eased - 0.24), len);

    if (!copyShown && t > 0.74) {
      overlay.classList.add("is-copy-visible");
      copyShown = TrueCapitalitatV5();
    }

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      window.setTimeout(() => {
        overlay.classList.add("is-copy-leaving");

        window.setTimeout(() => {
          fusionarPuntsCapitalitatV5(overlay, [dot1, dot2, dot3], { x: 116, y: 190 }, () => {
            overlay.classList.add("is-seed-visible");

            window.setTimeout(() => {
              overlay.classList.add("is-timeline-start");
            }, 360);

            window.setTimeout(() => {
              overlay.classList.add("is-progress-visible");
            }, 2700);

            window.setTimeout(() => {
              animarPercentatgeCapitalitatV5(numberEl, circleEl, progress.percent, 1650);
            }, 3020);
          });
        }, 620);
      }, 900);
    }
  }

  requestAnimationFrame(frame);
}

function TrueCapitalitatV5() {
  return true;
}

/* === CAPITALITAT_V5_DOTS_FROM_CORNERS_START === */

/* ============================================================
   CAPITALITAT V5 · PUNTS DES DE DIFERENTS EXTREMS + MÉS LENT
============================================================ */

function animarPerimetreCapitalitatV5(overlay, progress) {
  const path = overlay.querySelector("[data-cv5-path-1]");

  const dot1 = overlay.querySelector("[data-cv5-dot-1]");
  const dot2 = overlay.querySelector("[data-cv5-dot-2]");
  const dot3 = overlay.querySelector("[data-cv5-dot-3]");

  const numberEl = overlay.querySelector("[data-cv5-number]");
  const circleEl = overlay.querySelector("[data-cv5-circle]");

  const len = path.getTotalLength();
  prepararPath(path, len);

  // Tres punts que apareixen des de tres extrems diferents del camp SVG
  const startPositions = [
    { x: -120, y: -90 },   // cantonada superior esquerra (molt lluny)
    { x: 360, y: -90 },    // cantonada superior dreta (molt lluny)
    { x: 360, y: 500 }     // cantonada inferior dreta (molt lluny)
  ];

  const targetPositions = [
    path.getPointAtLength(0),
    path.getPointAtLength(len * 0.12),
    path.getPointAtLength(len * 0.24)
  ];

  dot1.setAttribute("cx", startPositions[0].x);
  dot1.setAttribute("cy", startPositions[0].y);

  dot2.setAttribute("cx", startPositions[1].x);
  dot2.setAttribute("cy", startPositions[1].y);

  dot3.setAttribute("cx", startPositions[2].x);
  dot3.setAttribute("cy", startPositions[2].y);

  dot1.style.opacity = "0";
  dot2.style.opacity = "0";
  dot3.style.opacity = "0";

  const flyStart = performance.now();
  const flyDuration = 1350;

  function flyFrame(now) {
    const t = Math.min(1, (now - flyStart) / flyDuration);
    const eased = 1 - Math.pow(1 - t, 3);

    [dot1, dot2, dot3].forEach((dot, index) => {
      const sx = startPositions[index].x;
      const sy = startPositions[index].y;
      const tx = targetPositions[index].x;
      const ty = targetPositions[index].y;

      const x = sx + (tx - sx) * eased;
      const y = sy + (ty - sy) * eased;

      dot.setAttribute("cx", x.toFixed(2));
      dot.setAttribute("cy", y.toFixed(2));
      dot.style.opacity = String(Math.min(1, eased * 1.4));
    });

    if (t < 1) {
      requestAnimationFrame(flyFrame);
    } else {
      iniciarDibuixPerimetreCapitalitatV5(overlay, progress, path, len, dot1, dot2, dot3, numberEl, circleEl);
    }
  }

  requestAnimationFrame(flyFrame);
}

function iniciarDibuixPerimetreCapitalitatV5(overlay, progress, path, len, dot1, dot2, dot3, numberEl, circleEl) {
  const start = performance.now();

  // Abans era 3600. Ara és una mica més lent, però no massa.
  const duration = 5600;
  let copyShown = false;

  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 2.05);

    pintarPath(path, len, eased);

    // Els tres punts avancen amb una petita separació perquè sembli més viu.
    posicionarDot(path, dot1, eased, len);
    posicionarDot(path, dot2, Math.max(0, eased - 0.10), len);
    posicionarDot(path, dot3, Math.max(0, eased - 0.20), len);

    if (!copyShown && t > 0.80) {
      overlay.classList.add("is-copy-visible");
      copyShown = true;
    }

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      window.setTimeout(() => {
        overlay.classList.add("is-copy-leaving");

        window.setTimeout(() => {
          fusionarPuntsCapitalitatV5(overlay, [dot1, dot2, dot3], { x: 116, y: 190 }, () => {
            overlay.classList.add("is-seed-visible");

            window.setTimeout(() => {
              overlay.classList.add("is-timeline-start");
            }, 360);

            window.setTimeout(() => {
              overlay.classList.add("is-progress-visible");
            }, 2700);

            window.setTimeout(() => {
              animarPercentatgeCapitalitatV5(numberEl, circleEl, progress.percent, 1650);
            }, 3020);
          });
        }, 620);
      }, 900);
    }
  }

  requestAnimationFrame(frame);
}


/* === CAPITALITAT_V5_FINAL_AUTO_CLOSE_START === */

/* Tanca l'animació 3 segons després d'acabar el percentatge final */
const mostrarExperienciaCapitalitatV5_base_auto_close_final = mostrarExperienciaCapitalitatV5;

mostrarExperienciaCapitalitatV5 = function() {
  mostrarExperienciaCapitalitatV5_base_auto_close_final();

  if (window.__capitalitatV5AutoCloseTimer) {
    clearTimeout(window.__capitalitatV5AutoCloseTimer);
  }

  // Temps aproximat de tota la seqüència + 3 segons de pausa final.
  window.__capitalitatV5AutoCloseTimer = setTimeout(() => {
    const overlay = document.getElementById("capitalitat-v5-overlay");
    if (!overlay) return;

    overlay.classList.add("is-closing");

    setTimeout(() => {
      if (document.body.contains(overlay)) {
        overlay.remove();
      }
    }, 700);
  }, 18500);
};

/* === CAPITALITAT_TOTAL_CHARTS_FIX_START === */

/* ============================================================
   TOTAL PASSIS · 5 GRÀFIQUES EN FILA + DADES NORMALITZADES
============================================================ */

(() => {
  let capitalitatRowsCache = null;
  let capitalitatKeysCache = null;

  const MONTHS_CA = [
    "Gener", "Febrer", "Març", "Abril", "Maig", "Juny",
    "Juliol", "Agost", "Setembre", "Octubre", "Novembre", "Desembre"
  ];

  function capNorm(value) {
    return String(value ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function capNormCategory(value) {
    const v = capNorm(value);

    if (!v) return "Sense categoria";

    const low = v.toLowerCase();

    if (low === "rutes" || low === "ruta") return "Rutes";
    if (low === "exposicio" || low === "exposició" || low === "exposicions") return "Exposicions";
    if (low === "conferencia" || low === "conferència" || low === "conferències") return "Conferències";
    if (low === "instal·lacio" || low === "instal·lació" || low === "instal·lacions") return "Instal·lacions";
    if (low === "taller" || low === "tallers") return "Tallers";

    return v;
  }

  function capNormEntrada(value) {
    const v = capNorm(value);
    if (!v) return "Sense informació";

    const low = v.toLowerCase();

    if (low.includes("inscrip")) return "Gratuïta amb inscripció prèvia";
    if (low.includes("pagament")) return "De pagament";
    if (low === "gratuïta" || low === "gratuita" || low === "gratuït" || low === "gratuit") return "Gratuïta";

    return v;
  }

  function capCountBy(rows, key, normalizer = capNorm) {
    const map = new Map();

    rows.forEach(row => {
      const label = normalizer(row[key]);
      map.set(label, (map.get(label) || 0) + 1);
    });

    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "ca"));
  }

  function capParseDate(value) {
    const raw = capNorm(value);
    if (!raw) return null;

    const match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (!match) return null;

    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    let year = Number(match[3]);

    if (year < 100) year += 2000;

    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
    if (month < 0 || month > 11) return null;

    return new Date(year, month, day);
  }

  async function capLoadRows() {
    if (capitalitatRowsCache && capitalitatKeysCache) {
      return { rows: capitalitatRowsCache, keys: capitalitatKeysCache };
    }

    const response = await fetch("data/inscripcions.json?v=" + Date.now());
    const data = await response.json();

    capitalitatRowsCache = Array.isArray(data.rows) ? data.rows : [];
    capitalitatKeysCache = data.columnKeys || {};

    return {
      rows: capitalitatRowsCache,
      keys: capitalitatKeysCache
    };
  }

  function capFindChart(idOptions) {
    for (const id of idOptions) {
      const el = document.getElementById(id);
      if (el) return el;
    }

    return null;
  }

  function capFindCard(chartEl) {
    if (!chartEl) return null;

    return chartEl.closest(
      ".chart-card, .dashboard-card, .glass-card, .panel, .card, .stat-card, .chart-panel"
    ) || chartEl.parentElement;
  }

  function capInstallFiveChartRow() {
    const charts = [
      capFindChart(["chart-modalitat"]),
      capFindChart(["chart-categoria"]),
      capFindChart(["chart-districte"]),
      capFindChart(["chart-responsable", "chart-encarregada"]),
      capFindChart(["chart-tipus-entrada", "chart-entrada"])
    ].filter(Boolean);

    if (charts.length < 2) return;

    const cards = charts.map(capFindCard).filter(Boolean);
    if (!cards.length) return;

    const firstCard = cards[0];

    let wrapper = document.querySelector(".capitalitat-five-charts-row");
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.className = "capitalitat-five-charts-row";
      firstCard.parentElement.insertBefore(wrapper, firstCard);
    }

    cards.forEach(card => {
      card.classList.add("capitalitat-five-chart-card");
      wrapper.appendChild(card);
    });
  }

  function capRenderLinearChart(chartEl, title, items, total) {
    if (!chartEl) return;

    const max = Math.max(1, ...items.map(item => item.value));

    chartEl.innerHTML = `
      <div class="cap-linear-chart">
        <div class="cap-linear-head">
          <strong>${title}</strong>
          <span>${total} passis</span>
        </div>

        <div class="cap-linear-list">
          ${items.map(item => {
            const width = Math.max(3, Math.round((item.value / max) * 100));
            return `
              <div class="cap-linear-row" title="${item.label}: ${item.value} passis">
                <div class="cap-linear-label">
                  <span>${item.label}</span>
                  <strong>${item.value}</strong>
                </div>
                <div class="cap-linear-track">
                  <i style="width:${width}%"></i>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  function capBuildSmoothPath(points) {
    if (!points || points.length < 2) return "";

    let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

    for (let i = 0; i < points.length - 1; i += 1) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    }

    return d;
  }

  function capRenderMonthChart(chartEl, rows, keys) {
    if (!chartEl) return;

    const dateKey = keys.dataInici || "data_inici";
    const categoryKey = keys.categoria || "categoria";

    const monthlyPasses = Array.from({ length: 12 }, () => 0);
    const monthlyCategories = Array.from({ length: 12 }, () => new Set());

    rows.forEach(row => {
      const date = capParseDate(row[dateKey]);
      if (!date) return;

      const monthIndex = date.getMonth();
      monthlyPasses[monthIndex] += 1;

      const category = capNormCategory(row[categoryKey]);
      if (category && category !== "Sense categoria") {
        monthlyCategories[monthIndex].add(category);
      }
    });

    const monthlyCategoryCounts = monthlyCategories.map(set => set.size);
    const totalPasses = rows.length;
    const maxPasses = Math.max(1, ...monthlyPasses);
    const maxCategories = Math.max(1, ...monthlyCategoryCounts);

    const tickStep = maxPasses > 500 ? 500 : 100;
    const maxX = Math.max(tickStep, Math.ceil(maxPasses / tickStep) * tickStep);

    const width = 1080;
    const height = 430;
    const padTop = 42;
    const padRight = 70;
    const padBottom = 50;
    const padLeft = 130;

    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;
    const rowStep = plotH / 11;

    const passPoints = monthlyPasses.map((value, index) => ({
      month: MONTHS_CA[index],
      value,
      x: padLeft + (value / maxX) * plotW,
      y: padTop + rowStep * index
    }));

    const categoryPoints = monthlyCategoryCounts.map((value, index) => ({
      month: MONTHS_CA[index],
      value,
      x: padLeft + (value / maxCategories) * plotW,
      y: padTop + rowStep * index
    }));

    const passPath = capBuildSmoothPath(passPoints);
    const categoryPath = capBuildSmoothPath(categoryPoints);

    const xTicks = [];
    for (let v = 0; v <= maxX; v += tickStep) {
      xTicks.push(v);
    }

    const peakMonthIndex = monthlyPasses.indexOf(maxPasses);
    const peakMonth = MONTHS_CA[peakMonthIndex];
    const avgPasses = Math.round(totalPasses / 12);

    chartEl.innerHTML = `
      <div class="cap-month-chart cap-month-chart-premium">
        <div class="cap-month-head cap-month-head-premium">
          <div class="cap-month-kpis">
            <div class="cap-month-kpi">
              <strong>${totalPasses}</strong>
              <span>PASSIS TOTALS</span>
            </div>
            <div class="cap-month-kpi">
              <strong>${maxPasses}</strong>
              <span>PIC MENSUAL · ${peakMonth.toUpperCase()}</span>
            </div>
            <div class="cap-month-kpi cap-month-kpi-small">
              <strong>${avgPasses}</strong>
              <span>MITJANA / MES</span>
            </div>
          </div>

          <div class="cap-month-meta-note">
            <span class="cap-month-badge is-yellow">Passis per mes</span>
            <span class="cap-month-badge is-white">Categories diferents / mes</span>
          </div>
        </div>

        <div class="cap-month-svg-wrap cap-month-svg-wrap-premium">
          <svg class="cap-month-svg cap-month-svg-premium" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="Passis per mes i categories per mes">
            <defs>
              <linearGradient id="capPassLineGradient" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stop-color="rgba(255,228,92,0.30)" />
                <stop offset="35%" stop-color="rgba(255,228,92,0.95)" />
                <stop offset="100%" stop-color="rgba(255,228,92,0.75)" />
              </linearGradient>
            </defs>

            ${xTicks.map(v => {
              const x = padLeft + (v / maxX) * plotW;
              return `
                <line class="cap-month-grid-vertical" x1="${x}" y1="${padTop}" x2="${x}" y2="${padTop + plotH}" />
                <text class="cap-month-axis-x" x="${x}" y="${height - 12}" text-anchor="middle">${v}</text>
              `;
            }).join("")}

            ${passPoints.map(p => `
              <text class="cap-month-axis-y" x="${padLeft - 16}" y="${p.y + 4}" text-anchor="end">${p.month}</text>
            `).join("")}

            <path d="${categoryPath}" class="cap-month-line-categories" />
            <path d="${passPath}" class="cap-month-line-passes" />

            ${categoryPoints.map(p => `
              <g class="cap-month-point cap-month-point-categories"
                 data-series="Categories diferents"
                 data-month="${p.month}"
                 data-value="${p.value}"
                 transform="translate(${p.x}, ${p.y})">
                <circle r="4.4"></circle>
              </g>
            `).join("")}

            ${passPoints.map(p => `
              <g class="cap-month-point cap-month-point-passes"
                 data-series="Passis"
                 data-month="${p.month}"
                 data-value="${p.value}"
                 transform="translate(${p.x}, ${p.y})">
                <circle r="5.6"></circle>
              </g>
            `).join("")}
          </svg>
        </div>

        <div class="cap-month-legend">
          <div class="cap-month-legend-item">
            <span class="cap-month-legend-line is-yellow"></span>
            <div>
              <strong>Passis per mes</strong>
              <span>Nombre total de passis segons la data d’inici.</span>
            </div>
          </div>

          <div class="cap-month-legend-item">
            <span class="cap-month-legend-line is-white"></span>
            <div>
              <strong>Categories diferents per mes</strong>
              <span>Nombre de categories presents cada mes.</span>
            </div>
          </div>
        </div>
      </div>
    `;

    capInstallMonthTooltip(chartEl);
  }

  function capInstallMonthTooltip(chartEl) {
    let tooltip = document.querySelector(".cap-month-tooltip");

    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.className = "cap-month-tooltip";
      document.body.appendChild(tooltip);
    }

    chartEl.querySelectorAll(".cap-month-point").forEach(point => {
      point.addEventListener("mouseenter", () => {
        const series = point.dataset.series;
        const month = point.dataset.month;
        const value = point.dataset.value;

        tooltip.innerHTML = `
          <strong>${value}</strong>
          <span>${series}</span>
          <em>${month}</em>
        `;
        tooltip.classList.add("is-visible");
      });

      point.addEventListener("mousemove", event => {
        tooltip.style.left = `${event.clientX + 16}px`;
        tooltip.style.top = `${event.clientY - 18}px`;
      });

      point.addEventListener("mouseleave", () => {
        tooltip.classList.remove("is-visible");
      });
    });
  }

  async function capRenderTotalChartsFixed() {
    try {
      const { rows, keys } = await capLoadRows();

      const total = rows.length;

      capRenderLinearChart(
        capFindChart(["chart-modalitat"]),
        "Modalitat",
        capCountBy(rows, keys.modalitat || "modalitat"),
        total
      );

      capRenderLinearChart(
        capFindChart(["chart-categoria"]),
        "Categoria",
        capCountBy(rows, keys.categoria || "categoria", capNormCategory),
        total
      );

      capRenderLinearChart(
        capFindChart(["chart-districte"]),
        "Districte",
        capCountBy(rows, keys.districte || "districte"),
        total
      );

      capRenderLinearChart(
        capFindChart(["chart-responsable", "chart-encarregada"]),
        "Encarregada",
        capCountBy(rows, keys.responsable || "encarregada"),
        total
      );

      capRenderLinearChart(
        capFindChart(["chart-tipus-entrada", "chart-entrada"]),
        "Tipus d’entrada",
        capCountBy(rows, keys.entrada || "entrada", capNormEntrada),
        total
      );

      capRenderMonthChart(
        capFindChart(["chart-any-complet", "chart-mesos-total", "chart-mesos"]),
        rows,
        keys
      );

      capInstallFiveChartRow();
    } catch (error) {
      console.error("Error renderitzant gràfiques totals corregides:", error);
    }
  }

  function capScheduleTotalChartsFixed() {
    window.setTimeout(capRenderTotalChartsFixed, 250);
    window.setTimeout(capRenderTotalChartsFixed, 900);
  }

  document.addEventListener("DOMContentLoaded", capScheduleTotalChartsFixed);
  window.addEventListener("load", capScheduleTotalChartsFixed);

  document.addEventListener("click", event => {
    const target = event.target.closest("button, a, .nav-item, .sidebar-item");
    if (!target) return;

    const txt = capNorm(target.textContent).toLowerCase();

    if (
      txt.includes("total passis") ||
      txt.includes("passis") ||
      txt.includes("total")
    ) {
      capScheduleTotalChartsFixed();
    }
  });
})();

/* === CAPITALITAT_CALENDAR_ANNUAL_MATRIX_START === */

/* ============================================================
   CALENDARI · MENSUAL / ANUAL + MATRIU ANUAL
============================================================ */

(() => {
  const MONTHS_FULL = [
    "Gener", "Febrer", "Març", "Abril", "Maig", "Juny",
    "Juliol", "Agost", "Setembre", "Octubre", "Novembre", "Desembre"
  ];

  const MONTHS_SHORT = [
    "GEN", "FEB", "MAR", "ABR", "MAI", "JUN",
    "JUL", "AGO", "SET", "OCT", "NOV", "DES"
  ];

  let calendarDataCache = null;

  function capHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function capNorm(value) {
    return String(value ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function capNormCategory(value) {
    const v = capNorm(value);
    if (!v) return "Sense categoria";

    const low = v.toLowerCase();

    if (low === "rutes" || low === "ruta") return "Rutes";
    if (low === "exposicio" || low === "exposició" || low === "exposicions") return "Exposicions";
    if (low === "conferencia" || low === "conferència" || low === "conferències") return "Conferències";
    if (low === "instal·lacio" || low === "instal·lació" || low === "instal·lacions") return "Instal·lacions";
    if (low === "taller" || low === "tallers") return "Tallers";

    return v;
  }

  function capParseDate(value) {
    const raw = capNorm(value);
    if (!raw) return null;

    const match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (!match) return null;

    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    let year = Number(match[3]);

    if (year < 100) year += 2000;
    if (month < 0 || month > 11) return null;

    return new Date(year, month, day);
  }

  async function capLoadCalendarData() {
    if (calendarDataCache) return calendarDataCache;

    const response = await fetch("data/inscripcions.json?v=" + Date.now());
    const data = await response.json();

    calendarDataCache = {
      rows: Array.isArray(data.rows) ? data.rows : [],
      keys: data.columnKeys || {}
    };

    return calendarDataCache;
  }

  function capFindCalendarView() {
    return (
      document.getElementById("view-calendari") ||
      document.getElementById("view-calendar") ||
      document.querySelector('[data-view="calendari"]') ||
      document.querySelector('[data-view="calendar"]') ||
      document.querySelector(".view-calendari") ||
      document.querySelector(".view-calendar") ||
      document.querySelector(".calendar-view") ||
      document.querySelector("#calendar") ||
      document.querySelector(".calendar-section")
    );
  }

  function capEnsureCalendarTabs() {
    const view = capFindCalendarView();
    if (!view) return null;

    let tabs = view.querySelector(".cap-calendar-tabs");
    let monthlyPanel = view.querySelector(".cap-calendar-monthly-panel");
    let annualPanel = view.querySelector(".cap-calendar-annual-panel");

    if (!tabs) {
      tabs = document.createElement("div");
      tabs.className = "cap-calendar-tabs";
      tabs.innerHTML = `
        <button class="is-active" type="button" data-cap-calendar-mode="monthly">Calendari mensual</button>
        <button type="button" data-cap-calendar-mode="annual">Calendari anual</button>
      `;

      monthlyPanel = document.createElement("div");
      monthlyPanel.className = "cap-calendar-monthly-panel";

      annualPanel = document.createElement("div");
      annualPanel.className = "cap-calendar-annual-panel";
      annualPanel.hidden = true;

      const originalChildren = [...view.children];
      view.prepend(tabs);
      view.appendChild(monthlyPanel);
      view.appendChild(annualPanel);

      originalChildren.forEach(child => {
        if (child === tabs || child === monthlyPanel || child === annualPanel) return;
        monthlyPanel.appendChild(child);
      });
    }

    tabs.querySelectorAll("[data-cap-calendar-mode]").forEach(button => {
      if (button.dataset.capCalendarBound) return;
      button.dataset.capCalendarBound = "1";

      button.addEventListener("click", () => {
        const mode = button.dataset.capCalendarMode;

        tabs.querySelectorAll("button").forEach(btn => {
          btn.classList.toggle("is-active", btn === button);
        });

        if (mode === "monthly") {
          monthlyPanel.hidden = false;
          annualPanel.hidden = true;
          capTryOpenCurrentMonth(monthlyPanel);
        }

        if (mode === "annual") {
          monthlyPanel.hidden = true;
          annualPanel.hidden = false;
          capRenderAnnualCalendarMatrix(annualPanel);
        }
      });
    });

    return { view, tabs, monthlyPanel, annualPanel };
  }

  function capTryOpenCurrentMonth(monthlyPanel) {
    if (!monthlyPanel) return;

    const now = new Date();
    const wantedMonth = MONTHS_FULL[now.getMonth()].toLowerCase();
    const wantedYear = String(now.getFullYear());

    const headerSelectors = [
      ".calendar-title",
      ".calendar-header",
      ".month-title",
      ".calendar-month",
      "h1",
      "h2",
      "h3"
    ];

    function readHeader() {
      for (const selector of headerSelectors) {
        const el = monthlyPanel.querySelector(selector);
        const text = capNorm(el?.textContent).toLowerCase();
        if (text) return text;
      }

      return capNorm(monthlyPanel.textContent).toLowerCase().slice(0, 400);
    }

    function isWantedMonth() {
      const text = readHeader();
      return text.includes(wantedMonth) && text.includes(wantedYear);
    }

    if (isWantedMonth()) return;

    const nextButton =
      monthlyPanel.querySelector('[data-calendar-next]') ||
      monthlyPanel.querySelector('[aria-label*="següent" i]') ||
      monthlyPanel.querySelector('[aria-label*="next" i]') ||
      [...monthlyPanel.querySelectorAll("button")].find(btn => {
        const t = capNorm(btn.textContent).toLowerCase();
        return t === "›" || t === ">" || t.includes("següent") || t.includes("next");
      });

    const prevButton =
      monthlyPanel.querySelector('[data-calendar-prev]') ||
      monthlyPanel.querySelector('[aria-label*="anterior" i]') ||
      monthlyPanel.querySelector('[aria-label*="prev" i]') ||
      [...monthlyPanel.querySelectorAll("button")].find(btn => {
        const t = capNorm(btn.textContent).toLowerCase();
        return t === "‹" || t === "<" || t.includes("anterior") || t.includes("prev");
      });

    if (!nextButton && !prevButton) return;

    let attempts = 0;

    function step() {
      if (isWantedMonth() || attempts > 24) return;
      attempts += 1;

      const text = readHeader();

      if (text.includes("2025") && nextButton) {
        nextButton.click();
      } else if (text.includes("2027") && prevButton) {
        prevButton.click();
      } else if (nextButton) {
        nextButton.click();
      }

      window.setTimeout(step, 40);
    }

    step();
  }

  function capCountMapIncrement(map, key, amount = 1) {
    const cleanKey = key || "Sense informació";
    map.set(cleanKey, (map.get(cleanKey) || 0) + amount);
  }

  function capTopEntries(map, limit = 4) {
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "ca"))
      .slice(0, limit);
  }

  function capDominantFromMap(map) {
    return capTopEntries(map, 1)[0]?.label || "Sense informació";
  }

  function capModClass(modalitat) {
    const m = capNorm(modalitat).toUpperCase();

    if (m === "A") return "is-mod-a";
    if (m === "B") return "is-mod-b";
    if (m === "C") return "is-mod-c";

    return "is-mod-other";
  }

  async function capRenderAnnualCalendarMatrix(annualPanel) {
    if (!annualPanel) return;

    annualPanel.innerHTML = `
      <div class="cap-annual-loading">
        Construint calendari anual...
      </div>
    `;

    const { rows, keys } = await capLoadCalendarData();

    const dateKey = keys.dataInici || "data_inici";
    const categoryKey = keys.categoria || "categoria";
    const modalitatKey = keys.modalitat || "modalitat";
    const districtKey = keys.districte || "districte";

    const targetYear = 2026;

    const yearRows = rows.filter(row => {
      const date = capParseDate(row[dateKey]);
      return date && date.getFullYear() === targetYear;
    });

    const totalAllRows = rows.length;
    const totalYearRows = yearRows.length;

    const monthTotals = Array.from({ length: 12 }, () => 0);
    const categoryTotals = new Map();
    const districtTotals = new Map();

    const categoryMonthMap = new Map();

    yearRows.forEach(row => {
      const date = capParseDate(row[dateKey]);
      if (!date) return;

      const monthIndex = date.getMonth();
      const category = capNormCategory(row[categoryKey]);
      const modalitat = capNorm(row[modalitatKey]) || "Sense modalitat";
      const district = capNorm(row[districtKey]) || "Sense districte";

      monthTotals[monthIndex] += 1;
      capCountMapIncrement(categoryTotals, category);
      capCountMapIncrement(districtTotals, district);

      if (!categoryMonthMap.has(category)) {
        categoryMonthMap.set(category, {
          category,
          total: 0,
          months: Array.from({ length: 12 }, () => ({
            total: 0,
            modalitats: new Map(),
            districtes: new Map()
          }))
        });
      }

      const categoryObj = categoryMonthMap.get(category);
      const cell = categoryObj.months[monthIndex];

      categoryObj.total += 1;
      cell.total += 1;
      capCountMapIncrement(cell.modalitats, modalitat);
      capCountMapIncrement(cell.districtes, district);
    });

    const categories = [...categoryMonthMap.values()]
      .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category, "ca"));

    const maxCell = Math.max(
      1,
      ...categories.flatMap(category => category.months.map(month => month.total))
    );

    const peakMonthValue = Math.max(0, ...monthTotals);
    const peakMonthIndex = monthTotals.indexOf(peakMonthValue);

    const topCategory = capTopEntries(categoryTotals, 1)[0] || { label: "—", value: 0 };
    const topDistrict = capTopEntries(districtTotals, 1)[0] || { label: "—", value: 0 };

    const cellW = 72;
    const rowH = 34;
    const padLeft = 170;
    const padTop = 78;
    const padRight = 40;
    const padBottom = 82;

    const width = padLeft + cellW * 12 + padRight;
    const height = padTop + rowH * Math.max(1, categories.length) + padBottom;

    annualPanel.innerHTML = `
      <section class="cap-annual-card">
        <div class="cap-annual-head">
          <div>
            <span>Calendari anual</span>
            <h3>Matriu anual de passis · ${targetYear}</h3>
            <p>X = mesos · Y = categories · mida = nombre de passis · color = modalitat dominant</p>
          </div>
        </div>

        <div class="cap-annual-kpis">
          <div>
            <strong>${totalAllRows}</strong>
            <span>Passis totals base</span>
          </div>

          <div>
            <strong>${totalYearRows}</strong>
            <span>Passis amb data ${targetYear}</span>
          </div>

          <div>
            <strong>${MONTHS_FULL[peakMonthIndex] || "—"}</strong>
            <span>Mes més actiu · ${peakMonthValue}</span>
          </div>

          <div>
            <strong>${capHtml(topCategory.label)}</strong>
            <span>Categoria principal · ${topCategory.value}</span>
          </div>

          <div>
            <strong>${capHtml(topDistrict.label)}</strong>
            <span>Districte principal · ${topDistrict.value}</span>
          </div>
        </div>

        <div class="cap-annual-scroll">
          <svg class="cap-annual-svg"
               viewBox="0 0 ${width} ${height}"
               style="min-width:${width}px; height:${height}px;"
               aria-label="Matriu anual de passis per categoria i mes">

            ${MONTHS_SHORT.map((month, index) => {
              const x = padLeft + index * cellW + cellW / 2;
              return `
                <text class="cap-annual-month-label"
                      x="${x}"
                      y="34"
                      text-anchor="middle">${month}</text>

                <line class="cap-annual-grid-line"
                      x1="${x}"
                      y1="${padTop - 24}"
                      x2="${x}"
                      y2="${height - padBottom + 12}" />
              `;
            }).join("")}

            ${categories.map((category, rowIndex) => {
              const y = padTop + rowIndex * rowH + rowH / 2;
              return `
                <text class="cap-annual-category-label"
                      x="${padLeft - 18}"
                      y="${y + 4}"
                      text-anchor="end">${capHtml(category.category)}</text>

                <line class="cap-annual-row-line"
                      x1="${padLeft - 6}"
                      y1="${y}"
                      x2="${width - padRight}"
                      y2="${y}" />
              `;
            }).join("")}

            ${categories.flatMap((category, rowIndex) => {
              return category.months.map((cell, monthIndex) => {
                if (!cell.total) return "";

                const x = padLeft + monthIndex * cellW + cellW / 2;
                const y = padTop + rowIndex * rowH + rowH / 2;
                const radius = 3.5 + Math.sqrt(cell.total / maxCell) * 16;
                const dominantModalitat = capDominantFromMap(cell.modalitats);
                const dominantDistrictes = capTopEntries(cell.districtes, 3)
                  .map(item => `${item.label} (${item.value})`)
                  .join(", ");

                return `
                  <circle
                    class="cap-annual-bubble ${capModClass(dominantModalitat)}"
                    cx="${x}"
                    cy="${y}"
                    r="${radius.toFixed(2)}"
                    data-month="${capHtml(MONTHS_FULL[monthIndex])}"
                    data-category="${capHtml(category.category)}"
                    data-total="${cell.total}"
                    data-modalitat="${capHtml(dominantModalitat)}"
                    data-districtes="${capHtml(dominantDistrictes || "Sense informació")}"
                  />
                `;
              });
            }).join("")}
          </svg>
        </div>

        <div class="cap-annual-legend">
          <div><i class="is-mod-a"></i><span>Modalitat A</span></div>
          <div><i class="is-mod-b"></i><span>Modalitat B</span></div>
          <div><i class="is-mod-c"></i><span>Modalitat C</span></div>
          <div><i class="is-mod-other"></i><span>Altres / sense modalitat</span></div>
          <p>La mida del punt indica el nombre de passis d’aquella categoria durant aquell mes.</p>
        </div>
      </section>
    `;

    capInstallAnnualTooltip(annualPanel);
  }

  function capInstallAnnualTooltip(annualPanel) {
    let tooltip = document.querySelector(".cap-annual-tooltip");

    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.className = "cap-annual-tooltip";
      document.body.appendChild(tooltip);
    }

    annualPanel.querySelectorAll(".cap-annual-bubble").forEach(bubble => {
      bubble.addEventListener("mouseenter", () => {
        tooltip.innerHTML = `
          <strong>${bubble.dataset.total} passis</strong>
          <span>${bubble.dataset.month} · ${bubble.dataset.category}</span>
          <em>Modalitat dominant: ${bubble.dataset.modalitat}</em>
          <em>Districtes: ${bubble.dataset.districtes}</em>
        `;

        tooltip.classList.add("is-visible");
      });

      bubble.addEventListener("mousemove", event => {
        tooltip.style.left = `${event.clientX + 16}px`;
        tooltip.style.top = `${event.clientY - 18}px`;
      });

      bubble.addEventListener("mouseleave", () => {
        tooltip.classList.remove("is-visible");
      });
    });
  }

  function capEnhanceCalendar() {
    const parts = capEnsureCalendarTabs();
    if (!parts) return;

    capTryOpenCurrentMonth(parts.monthlyPanel);
  }

  function capScheduleEnhanceCalendar() {
    setTimeout(capEnhanceCalendar, 300);
    setTimeout(capEnhanceCalendar, 1000);
    setTimeout(capEnhanceCalendar, 1800);
  }

  document.addEventListener("DOMContentLoaded", capScheduleEnhanceCalendar);
  window.addEventListener("load", capScheduleEnhanceCalendar);

  document.addEventListener("click", event => {
    const target = event.target.closest("button, a, .nav-item, .sidebar-item");
    if (!target) return;

    const text = capNorm(target.textContent).toLowerCase();

    if (text.includes("calendari") || text.includes("calendar")) {
      capScheduleEnhanceCalendar();
    }
  });
})();

/* === CAPITALITAT_TOTAL_PASSIS_FINAL_FIXES_START === */

/* ============================================================
   TOTAL PASSIS · AJUSTOS FINALS
   Numeració, districte buit i neteja visual
============================================================ */

(() => {
  function capFixTotalPassisCards() {
    const row = document.querySelector(".capitalitat-five-charts-row");
    if (!row) return;

    const order = [
      { title: "Modalitat", number: "01" },
      { title: "Categoria", number: "02" },
      { title: "Districte", number: "03" },
      { title: "Encarregada", number: "04" },
      { title: "Tipus d’entrada", number: "05" }
    ];

    const cards = [...row.children];

    order.forEach((item, index) => {
      const card = cards[index];
      if (!card) return;

      card.dataset.capChartIndex = item.number;

      const possibleNumber = [...card.querySelectorAll("*")].find(el => {
        const text = (el.textContent || "").trim();
        return /^\d{2}$/.test(text) && el.children.length === 0;
      });

      if (possibleNumber) {
        possibleNumber.textContent = item.number;
      }

      const title = card.querySelector(".cap-linear-head strong");
      if (title) title.textContent = item.title;
    });

    // Districte buit → Sense districte
    const districtCard = cards[2];
    if (districtCard) {
      districtCard.querySelectorAll(".cap-linear-label span").forEach(label => {
        const clean = (label.textContent || "").replace(/\u00a0/g, " ").trim();
        if (!clean) {
          label.textContent = "Sense districte";
        }
      });

      districtCard.querySelectorAll(".cap-linear-row").forEach(row => {
        const label = row.querySelector(".cap-linear-label span");
        if (!label) return;

        const clean = (label.textContent || "").replace(/\u00a0/g, " ").trim();
        if (!clean) {
          label.textContent = "Sense districte";
        }

        const title = row.getAttribute("title") || "";
        if (title.startsWith(":")) {
          row.setAttribute("title", "Sense districte" + title);
        }
      });
    }
  }

  function capScheduleTotalPassisFinalFixes() {
    setTimeout(capFixTotalPassisCards, 300);
    setTimeout(capFixTotalPassisCards, 1000);
    setTimeout(capFixTotalPassisCards, 2200);
    setTimeout(capFixTotalPassisCards, 3800);
  }

  document.addEventListener("DOMContentLoaded", capScheduleTotalPassisFinalFixes);
  window.addEventListener("load", capScheduleTotalPassisFinalFixes);

  document.addEventListener("click", event => {
    const target = event.target.closest("button, a, .nav-item, .sidebar-item");
    if (!target) return;

    const text = String(target.textContent || "").toLowerCase();

    if (text.includes("total") || text.includes("passis")) {
      capScheduleTotalPassisFinalFixes();
    }
  });
})();

/* === CAPITALITAT_TOTAL_PASSIS_SURGICAL_FIX_START === */

/* ============================================================
   TOTAL PASSIS · FIX DIRECTE COLORS / TEXTOS / BARRES
============================================================ */

(() => {
  function normTxt(value) {
    return String(value ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function closestCard(el) {
    return el.closest(
      ".card, .panel, .stat-card, .summary-card, .metric-card, .kpi-card, .dashboard-card, .glass-card, [class*='card'], [class*='kpi'], [class*='summary']"
    );
  }

  function fixTopSummaryCards() {
    const all = [...document.querySelectorAll("body *")];

    all.forEach(el => {
      const txt = normTxt(el.textContent);

      if (txt === "Total de passis" || txt === "Passis gestionats per nosaltres") {
        const card = closestCard(el);
        if (!card) return;

        card.classList.add("cap-top-summary-fixed");
        el.classList.add("cap-top-summary-label");
        el.style.color = "#2b2d42";
        el.style.opacity = "1";

        card.querySelectorAll("*").forEach(child => {
          const childTxt = normTxt(child.textContent);

          if (childTxt === "1872" || childTxt === "374") {
            child.classList.add("cap-top-summary-number");
            child.style.color = "#d90429";
            child.style.opacity = "1";
            child.style.textShadow = "none";
          }
        });
      }
    });
  }

  function fixFiveCharts() {
    const row = document.querySelector(".capitalitat-five-charts-row");
    if (!row) return;

    const cards = [...row.querySelectorAll(".capitalitat-five-chart-card")];

    cards.forEach(card => {
      card.classList.add("cap-five-card-fixed");

      // Treu textos descriptius antics
      card.querySelectorAll("*").forEach(el => {
        const txt = normTxt(el.textContent);

        if (
          txt === "Totes les files del full INSCRIPCIONS." ||
          txt.includes("Totes les files del full INSCRIPCIONS")
        ) {
          el.style.display = "none";
        }
      });

      // Treu rodones decoratives buides de dalt a l'esquerra
      const cardRect = card.getBoundingClientRect();

      card.querySelectorAll("*").forEach(el => {
        const txt = normTxt(el.textContent);
        if (txt) return;

        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        const styles = window.getComputedStyle(el);
        const radius = parseFloat(styles.borderRadius) || 0;

        const isSmallCircle =
          rect.width >= 18 &&
          rect.width <= 56 &&
          rect.height >= 18 &&
          rect.height <= 56 &&
          radius >= 10 &&
          rect.left <= cardRect.left + 70 &&
          rect.top <= cardRect.top + 70;

        if (isSmallCircle) {
          el.style.display = "none";
        }
      });

      // Colors de text
      card.querySelectorAll("*").forEach(el => {
        el.style.textShadow = "none";
      });

      card.querySelectorAll(".cap-linear-head strong, h3, h4").forEach(el => {
        el.style.color = "#2b2d42";
      });

      card.querySelectorAll(".cap-linear-label span, .cap-linear-row span").forEach(el => {
        el.style.color = "#5f6778";
      });

      card.querySelectorAll(".cap-linear-row strong, .cap-linear-value, b").forEach(el => {
        el.style.color = "#d90429";
      });

      // Barres vermelles
      card.querySelectorAll(".cap-linear-track i").forEach(bar => {
        bar.style.background = "linear-gradient(90deg, #ef233c 0%, #d90429 100%)";
        bar.style.boxShadow = "0 0 10px rgba(217,4,41,0.10)";
      });

      card.querySelectorAll(".cap-linear-track").forEach(track => {
        track.style.background = "rgba(43,45,66,0.08)";
      });
    });
  }

  function fixTotalPassisSurgical() {
    fixTopSummaryCards();
    fixFiveCharts();
  }

  function scheduleFixTotalPassisSurgical() {
    setTimeout(fixTotalPassisSurgical, 200);
    setTimeout(fixTotalPassisSurgical, 800);
    setTimeout(fixTotalPassisSurgical, 1600);
    setTimeout(fixTotalPassisSurgical, 3000);
  }

  document.addEventListener("DOMContentLoaded", scheduleFixTotalPassisSurgical);
  window.addEventListener("load", scheduleFixTotalPassisSurgical);

  document.addEventListener("click", event => {
    const target = event.target.closest("button, a, .nav-item, .sidebar-item");
    if (!target) return;

    const text = normTxt(target.textContent).toLowerCase();

    if (text.includes("total") || text.includes("passis")) {
      scheduleFixTotalPassisSurgical();
    }
  });
})();




/* === CAPITALITAT_TOTAL_FINAL_STABLE_LAYOUT === */

(() => {
  if (window.__capTotalFinalStableLayout) return;
  window.__capTotalFinalStableLayout = true;

  const MONTHS = ["GEN", "FEB", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OCT", "NOV", "DES"];
  const MONTHS_FULL = ["gener", "febrer", "març", "abril", "maig", "juny", "juliol", "agost", "setembre", "octubre", "novembre", "desembre"];

  let dataCache = null;

  function norm(value) {
    return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function parseDate(value) {
    const raw = norm(value);
    const match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (!match) return null;

    const d = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    if (Number.isNaN(d.getTime())) return null;

    d.setHours(0, 0, 0, 0);
    return d;
  }

  function isTrue(value) {
    return String(value ?? "").trim().toUpperCase() === "TRUE";
  }

  function percent(value) {
    return `${value.toFixed(1).replace(".", ",")}%`;
  }

  function smooth(points) {
    if (!points.length) return "";

    let d = `M ${points[0].x} ${points[0].y}`;

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }

    return d;
  }

  async function loadData() {
    if (dataCache) return dataCache;

    const response = await fetch(`data/inscripcions.json?t=${Date.now()}`);
    if (!response.ok) throw new Error("No s'ha pogut carregar data/inscripcions.json");

    dataCache = await response.json();
    return dataCache;
  }

  function getRows(data) {
    return Array.isArray(data.rows) ? data.rows : [];
  }

  function countBy(rows, key, fallback) {
    const map = new Map();

    rows.forEach(row => {
      const raw = norm(row[key]);
      const label = raw || fallback;
      map.set(label, (map.get(label) || 0) + 1);
    });

    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "ca"));
  }

  function computeStats(data) {
    const rows = getRows(data);
    const keys = data.columnKeys || {};

    const startKey = keys.dataInici || "data_inici";
    const endKey = keys.dataFinal || "data_final";
    const gestioKey = keys.gestio || "propies";
    const modalitatKey = keys.modalitat || "modalitat";
    const categoriaKey = keys.categoria || "categoria";
    const districteKey = keys.districte || "districte";
    const encarregadaKey = keys.responsable || "encarregada";
    const entradaKey = keys.entrada || "entrada";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const year = today.getFullYear();
    const capEnd = new Date(year, 11, 13);
    capEnd.setHours(0, 0, 0, 0);

    const datedRows = rows.map(row => {
      const start = parseDate(row[startKey]);
      const end = parseDate(row[endKey]) || start;
      return { row, start, end };
    }).filter(item => item.start);

    let yearRows = datedRows.filter(item => item.start.getFullYear() === year);
    if (!yearRows.length) yearRows = datedRows;

    const total = rows.length;
    const autogestionades = rows.filter(row => isTrue(row[gestioKey])).length;

    const finalitzades = datedRows.filter(item => item.end && item.end < today).length;
    const pendents = datedRows.filter(item => item.start > today && item.start <= capEnd).length;

    const monthCounts = Array(12).fill(0);
    yearRows.forEach(item => {
      monthCounts[item.start.getMonth()] += 1;
    });

    const currentMonth = today.getMonth();
    const daysInMonth = new Date(year, currentMonth + 1, 0).getDate();
    const dailyCounts = Array(daysInMonth).fill(0);

    yearRows.forEach(item => {
      if (item.start.getMonth() === currentMonth && item.start.getFullYear() === year) {
        dailyCounts[item.start.getDate() - 1] += 1;
      }
    });

    const todayCount = dailyCounts[today.getDate() - 1] || 0;
    const currentMonthTotal = dailyCounts.reduce((a, b) => a + b, 0);

    return {
      rows,
      keys,
      today,
      total,
      autogestionades,
      finalitzades,
      pendents,
      avui: todayCount,
      avuiPercentMes: currentMonthTotal ? todayCount / currentMonthTotal * 100 : 0,
      currentMonth,
      currentMonthTotal,
      dailyCounts,
      daysInMonth,
      monthCounts,
      monthTotal: monthCounts.reduce((a, b) => a + b, 0),
      monthPeak: Math.max(...monthCounts),
      monthPeakIndex: monthCounts.indexOf(Math.max(...monthCounts)),
      monthAverage: Math.round(monthCounts.reduce((a, b) => a + b, 0) / 12),
      internal: {
        modalitat: countBy(rows, modalitatKey, "Sense modalitat"),
        categoria: countBy(rows, categoriaKey, "Sense categoria"),
        districte: countBy(rows, districteKey, "Sense districte"),
        encarregada: countBy(rows, encarregadaKey, "Sense responsable"),
        entrada: countBy(rows, entradaKey, "Sense informació")
      }
    };
  }

  function renderKpis(stats) {
    const kpis = [
      ["Total passis", stats.total, 100, `${stats.total} totals`],
      ["Autogestionades", stats.autogestionades, stats.total ? stats.autogestionades / stats.total * 100 : 0, `${stats.autogestionades} pròpies`],
      ["Finalitzades", stats.finalitzades, stats.total ? stats.finalitzades / stats.total * 100 : 0, `${stats.finalitzades} acabades`],
      ["Pendents", stats.pendents, stats.total ? stats.pendents / stats.total * 100 : 0, `${stats.pendents} pendents`],
      ["Avui", stats.avui, stats.currentMonthTotal ? stats.avui / stats.currentMonthTotal * 100 : 0, `${stats.avui} passis avui`]
    ];

    return `
      <section class="cap-final-kpis">
        ${kpis.map(([title, value, pct, meta]) => `
          <article class="cap-final-kpi">
            <div class="cap-final-kpi-title">${esc(title)}</div>
            <div class="cap-final-kpi-meta">
              <span>● ${esc(meta)}</span>
              <span>● ${percent(pct)}</span>
            </div>
            <div class="cap-final-kpi-value">${value}</div>
            <div class="cap-final-kpi-percent">${percent(pct)}</div>
          </article>
        `).join("")}
      </section>
    `;
  }

  function renderYearChart(stats) {
    const width = 1160;
    const height = 330;
    const pad = { top: 34, right: 36, bottom: 56, left: 50 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const maxValue = Math.max(50, Math.ceil(Math.max(...stats.monthCounts, 1) / 50) * 50);

    const points = stats.monthCounts.map((value, index) => {
      const x = pad.left + (plotW / 11) * index;
      const y = pad.top + plotH - (value / maxValue) * plotH;
      return { x, y, value, month: MONTHS[index] };
    });

    const line = smooth(points);

    const yTicks = [];
    for (let v = 0; v <= maxValue; v += 50) yTicks.push(v);

    return `
      <section class="cap-final-wide-card">
        <div class="cap-final-section-head">
          <div>
            <h2>Activitats al llarg de l’any</h2>
            <p>Distribució mensual de passis segons la data d’inici.</p>
          </div>
          <div class="cap-final-section-kpis">
            <div><strong>${stats.monthTotal}</strong><span>passis totals</span></div>
            <div><strong>${stats.monthPeak}</strong><span>pic mensual · ${MONTHS_FULL[stats.monthPeakIndex]}</span></div>
            <div><strong>${stats.monthAverage}</strong><span>mitjana / mes</span></div>
          </div>
        </div>

        <svg class="cap-final-year-svg" viewBox="0 0 ${width} ${height}">
          ${yTicks.map(v => {
            const y = pad.top + plotH - (v / maxValue) * plotH;
            return `
              <line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" class="cap-final-grid"></line>
              <text x="${pad.left - 12}" y="${y + 4}" text-anchor="end" class="cap-final-axis">${v}</text>
            `;
          }).join("")}

          <path d="${line}" class="cap-final-year-line"></path>

          ${points.map(p => `
            <text x="${p.x}" y="${height - 18}" text-anchor="middle" class="cap-final-axis">${p.month}</text>
          `).join("")}
        </svg>
      </section>
    `;
  }

  function renderInternalStats(stats) {
    const cards = [
      ["Modalitat", stats.internal.modalitat],
      ["Categoria", stats.internal.categoria],
      ["Districte", stats.internal.districte],
      ["Encarregada", stats.internal.encarregada],
      ["Tipus d’entrada", stats.internal.entrada]
    ];

    return `
      <section class="cap-final-internal">
        <h2>Estadístiques internes</h2>
        <div class="cap-final-stats-grid">
          ${cards.map(([title, items]) => `
            <article class="cap-final-stat-card">
              <h3>${esc(title)}</h3>
              <div class="cap-final-stat-list">
                ${items.map(item => {
                  const pct = stats.total ? item.value / stats.total * 100 : 0;
                  return `
                    <div class="cap-final-stat-item">
                      <div class="cap-final-stat-row">
                        <span>${esc(item.label)}</span>
                        <strong>${item.value}</strong>
                      </div>
                      <div class="cap-final-stat-bar"><i style="width:${pct}%"></i></div>
                      <small>${percent(pct)}</small>
                    </div>
                  `;
                }).join("")}
              </div>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderDailyChart(stats) {
    const width = 1160;
    const height = 380;
    const pad = { top: 34, right: 36, bottom: 62, left: 50 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const yMax = 20;

    const points = stats.dailyCounts.map((value, index) => {
      const x = pad.left + (plotW / Math.max(1, stats.daysInMonth - 1)) * index;
      const y = pad.top + plotH - (Math.min(value, yMax) / yMax) * plotH;
      return { x, y, value, day: index + 1 };
    });

    const todayIndex = stats.today.getDate() - 1;
    const todayPoint = points[todayIndex] || points[0];
    const line = smooth(points);

    const yTicks = [];
    for (let v = 0; v <= yMax; v++) yTicks.push(v);

    return `
      <section class="cap-final-wide-card cap-final-daily">
        <div class="cap-final-section-head">
          <div>
            <h2>Activitat diària · ${MONTHS_FULL[stats.currentMonth]}</h2>
            <p>Passis per dia del mes vigent.</p>
          </div>
          <div class="cap-final-section-kpis">
            <div><strong>${stats.avui}</strong><span>AVUI = ${stats.avui} passis</span></div>
            <div><strong>${percent(stats.avuiPercentMes)}</strong><span>del total de ${MONTHS_FULL[stats.currentMonth]}</span></div>
          </div>
        </div>

        <svg class="cap-final-daily-svg" viewBox="0 0 ${width} ${height}">
          ${yTicks.map(v => {
            const y = pad.top + plotH - (v / yMax) * plotH;
            return `
              <line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" class="cap-final-grid light"></line>
              <text x="${pad.left - 12}" y="${y + 4}" text-anchor="end" class="cap-final-axis">${v}</text>
            `;
          }).join("")}

          <path d="${line}" class="cap-final-daily-line"></path>

          <line x1="${todayPoint.x}" y1="${todayPoint.y}" x2="${todayPoint.x}" y2="${pad.top + plotH}" class="cap-final-today-guide"></line>
          <circle cx="${todayPoint.x}" cy="${todayPoint.y}" r="4" class="cap-final-today-dot"></circle>
          <text x="${todayPoint.x}" y="${todayPoint.y - 14}" text-anchor="middle" class="cap-final-today-label">AVUI = ${todayPoint.value} passis</text>

          ${points.map(p => `
            <text x="${p.x}" y="${height - 18}" text-anchor="middle" class="cap-final-axis">${p.day}</text>
          `).join("")}
        </svg>
      </section>
    `;
  }

  async function renderStableDashboard() {
    const view = document.querySelector("#view-total");
    if (!view) return;

    const data = await loadData();
    const stats = computeStats(data);

    let dashboard = view.querySelector("#cap-total-stable-dashboard");

    if (!dashboard) {
      dashboard = document.createElement("section");
      dashboard.id = "cap-total-stable-dashboard";
      view.prepend(dashboard);
    }

    dashboard.innerHTML = `
      <header class="cap-final-hero">
        <div class="cap-final-eyebrow">Capitalitat Mundial de l’Arquitectura 2026</div>
        <h1>Inscripcions</h1>
        <p>Seguiment d’activitats, passis i espais vinculats al full d’INSCRIPCIONS.</p>
        <small>Dades carregades correctament · passis: ${stats.total} · autogestionades: ${stats.autogestionades}</small>
      </header>

      ${renderKpis(stats)}
      ${renderYearChart(stats)}
      ${renderInternalStats(stats)}
      ${renderDailyChart(stats)}
    `;
  }

  function scheduleRender() {
    setTimeout(() => renderStableDashboard().catch(console.error), 150);
    setTimeout(() => renderStableDashboard().catch(console.error), 900);
    setTimeout(() => renderStableDashboard().catch(console.error), 1800);
  }

  document.addEventListener("DOMContentLoaded", scheduleRender);
  window.addEventListener("load", scheduleRender);

  document.addEventListener("click", event => {
    const target = event.target.closest("button, .nav-pill, [data-view], .sidebar-item, .nav-item");
    if (!target) return;

    const txt = norm(target.textContent).toLowerCase();
    const view = target.getAttribute("data-view") || "";

    if (view.includes("total") || txt.includes("total") || txt.includes("passis")) {
      scheduleRender();
    }
  });
})();

/* === CAPITALITAT_REMOVE_DUPLICATED_INSCRIPCIONS_HERO === */

(() => {
  function removeDuplicatedInscripcionsHero() {
    const totalView = document.querySelector("#view-total");
    if (!totalView) return;

    // Elimina el bloc duplicat que vam generar dins del dashboard nou
    totalView.querySelectorAll(".cap-final-hero").forEach(el => el.remove());

    // Assegura que el títol original de dalt continuï visible
    totalView.querySelectorAll(".cap-original-total-header-hidden").forEach(el => {
      el.classList.remove("cap-original-total-header-hidden");
      el.style.display = "";
    });
  }

  function scheduleRemoveDuplicatedInscripcionsHero() {
    setTimeout(removeDuplicatedInscripcionsHero, 100);
    setTimeout(removeDuplicatedInscripcionsHero, 600);
    setTimeout(removeDuplicatedInscripcionsHero, 1400);
    setTimeout(removeDuplicatedInscripcionsHero, 2600);
  }

  document.addEventListener("DOMContentLoaded", scheduleRemoveDuplicatedInscripcionsHero);
  window.addEventListener("load", scheduleRemoveDuplicatedInscripcionsHero);

  document.addEventListener("click", event => {
    const btn = event.target.closest("button, .nav-pill, [data-view], .sidebar-item, .nav-item");
    if (!btn) return;

    const text = String(btn.textContent || "").toLowerCase();
    const view = btn.getAttribute("data-view") || "";

    if (view.includes("total") || text.includes("total") || text.includes("passis")) {
      scheduleRemoveDuplicatedInscripcionsHero();
    }
  });
})();


/* === CAPITALITAT_TRANSFORM_TOP_CARDS_TO_ORBS === */

(function () {
  function normalizePercent(text) {
    if (!text) return 0;
    const cleaned = String(text).replace(/\s+/g, '').replace('%','').replace(',', '.');
    const n = parseFloat(cleaned);
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  function formatPercentCA(value) {
    return value.toFixed(1).replace('.', ',') + '%';
  }

  function buildOrbCard({ title, value, percent, sublabel }) {
    const r = 34;
    const c = 2 * Math.PI * r;
    const dashoffset = c * (1 - percent / 100);

    return `
      <article class="cap-orb-card">
        <div class="cap-orb-top">
          <div class="cap-orb-meta">
            <h3 class="cap-orb-title">${title}</h3>
            <div class="cap-orb-value">${value}</div>
            <div class="cap-orb-sub">${sublabel || ''}</div>
          </div>

          <div class="cap-orb-chart" aria-label="${formatPercentCA(percent)}">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <circle class="cap-orb-track" cx="50" cy="50" r="${r}"></circle>
              <circle class="cap-orb-progress"
                cx="50" cy="50" r="${r}"
                stroke-dasharray="${c}"
                stroke-dashoffset="${dashoffset}">
              </circle>
            </svg>
            <div class="cap-orb-center">
              <div class="cap-orb-percent">${formatPercentCA(percent)}</div>
              <div class="cap-orb-percent-sub">del total</div>
            </div>
          </div>
        </div>

        <div class="cap-orb-bottom">
          <div class="cap-orb-bottom-left">
            <span class="cap-orb-dot"></span>
            <span>${sublabel || ''}</span>
          </div>
          <div class="cap-orb-bottom-right">${formatPercentCA(percent)}</div>
        </div>
      </article>
    `;
  }

  function extractCardData(card) {
    const text = card.innerText || "";

    const titleEl = card.querySelector("h2,h3,h4,.title,.card-title,.kpi-title,.metric-title");
    const title = titleEl ? titleEl.textContent.trim() : "";

    const valueMatch = text.match(/\b\d{1,4}(?:[.,]\d{3})*\b/);
    const value = valueMatch ? valueMatch[0].replace(/\.(?=\d{3}\b)/g, "") : "";

    const percentMatches = text.match(/\d+(?:[.,]\d+)?%/g) || [];
    const percent = percentMatches.length ? normalizePercent(percentMatches[percentMatches.length - 1]) : 0;

    let sublabel = "";
    const lines = text.split("\n").map(t => t.trim()).filter(Boolean);
    for (const line of lines) {
      if (line === title) continue;
      if (line === value) continue;
      if (/%/.test(line)) continue;
      if (/^\d+[.,]?\d*$/.test(line)) continue;
      if (line.length > 2) {
        sublabel = line;
        break;
      }
    }

    return { title, value, percent, sublabel };
  }

  function findTopSummaryCards() {
    const totalView = document.querySelector("#view-total");
    if (!totalView) return [];

    const selectors = [
      ".cap-kpi-card",
      ".kpi-card",
      ".summary-card",
      ".metric-card",
      ".stat-card",
      ".dashboard-card",
      ".top-card"
    ];

    let candidates = [];
    selectors.forEach(sel => {
      totalView.querySelectorAll(sel).forEach(el => candidates.push(el));
    });

    if (!candidates.length) {
      candidates = Array.from(totalView.querySelectorAll("section > div, .glass-card, .panel, article, .card"))
        .filter(el => {
          const t = (el.innerText || "").toLowerCase();
          return ["total passis", "autogestionades", "finalitzades", "pendents", "avui"]
            .some(k => t.includes(k));
        });
    }

    const wantedOrder = ["total passis", "autogestionades", "finalitzades", "pendents", "avui"];
    const picked = [];

    wantedOrder.forEach(label => {
      const found = candidates.find(el => (el.innerText || "").toLowerCase().includes(label));
      if (found && !picked.includes(found)) picked.push(found);
    });

    return picked.slice(0, 5);
  }

  function transformTopCardsToOrbs() {
    const totalView = document.querySelector("#view-total");
    if (!totalView) return;

    const sourceCards = findTopSummaryCards();
    if (sourceCards.length < 5) return;

    let grid = totalView.querySelector(".cap-orb-grid");
    if (!grid) {
      grid = document.createElement("div");
      grid.className = "cap-orb-grid";
      sourceCards[0].parentNode.insertBefore(grid, sourceCards[0]);
    }

    const data = sourceCards.map(extractCardData);

    grid.innerHTML = data.map(buildOrbCard).join("");

    sourceCards.forEach(card => {
      card.style.display = "none";
    });
  }

  function runOrbTransform() {
    setTimeout(transformTopCardsToOrbs, 100);
    setTimeout(transformTopCardsToOrbs, 700);
    setTimeout(transformTopCardsToOrbs, 1500);
  }

  document.addEventListener("DOMContentLoaded", runOrbTransform);
  window.addEventListener("load", runOrbTransform);

  const observer = new MutationObserver(() => {
    runOrbTransform();
  });

  window.addEventListener("load", () => {
    const totalView = document.querySelector("#view-total");
    if (totalView) observer.observe(totalView, { childList: true, subtree: true });
  });
})();

/* === CAPITALITAT_FORCE_ORB_KPIS_EXACT === */

(() => {
  let orbObserverStarted = false;

  function norm(value) {
    return String(value ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parsePercent(value) {
    const raw = norm(value).replace("%", "").replace(",", ".");
    const n = parseFloat(raw);
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  function formatPercent(value) {
    return `${value.toFixed(1).replace(".", ",")}%`;
  }

  function buildOrbCard({ title, value, percent, meta }) {
    const r = 35;
    const c = 2 * Math.PI * r;
    const offset = c * (1 - percent / 100);

    return `
      <article class="cap-orb-card-v2">
        <div class="cap-orb-left-v2">
          <h3>${title}</h3>
          <div class="cap-orb-number-v2">${value}</div>
          <p>${meta}</p>
        </div>

        <div class="cap-orb-ring-v2">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle class="cap-orb-ring-track-v2" cx="50" cy="50" r="${r}"></circle>
            <circle
              class="cap-orb-ring-progress-v2"
              cx="50"
              cy="50"
              r="${r}"
              stroke-dasharray="${c}"
              stroke-dashoffset="${offset}">
            </circle>
          </svg>
          <div class="cap-orb-ring-text-v2">
            <strong>${formatPercent(percent)}</strong>
          </div>
        </div>
      </article>
    `;
  }

  function transformExactKpis() {
    const dashboard = document.querySelector("#cap-total-stable-dashboard");
    if (!dashboard) return;

    const grid = dashboard.querySelector(".cap-final-kpis");
    if (!grid) return;

    if (grid.classList.contains("cap-orb-grid-v2") && grid.querySelectorAll(".cap-orb-card-v2").length === 5) {
      return;
    }

    const cards = Array.from(grid.querySelectorAll(".cap-final-kpi"));
    if (cards.length < 5) return;

    const data = cards.slice(0, 5).map(card => {
      const title = norm(card.querySelector(".cap-final-kpi-title")?.textContent);
      const value = norm(card.querySelector(".cap-final-kpi-value")?.textContent);
      const percentText = norm(card.querySelector(".cap-final-kpi-percent")?.textContent);
      const meta = norm(card.querySelector(".cap-final-kpi-meta span")?.textContent).replace(/^●\s*/, "");

      return {
        title,
        value,
        percent: parsePercent(percentText),
        meta
      };
    });

    grid.className = "cap-orb-grid-v2";
    grid.innerHTML = data.map(buildOrbCard).join("");
  }

  function scheduleOrbTransform() {
    setTimeout(transformExactKpis, 100);
    setTimeout(transformExactKpis, 500);
    setTimeout(transformExactKpis, 1200);
    setTimeout(transformExactKpis, 2200);
  }

  document.addEventListener("DOMContentLoaded", scheduleOrbTransform);
  window.addEventListener("load", scheduleOrbTransform);

  document.addEventListener("click", event => {
    const btn = event.target.closest("button, .nav-pill, [data-view], .sidebar-item, .nav-item");
    if (!btn) return;

    const text = norm(btn.textContent).toLowerCase();
    const view = btn.getAttribute("data-view") || "";

    if (view.includes("total") || text.includes("total") || text.includes("passis")) {
      scheduleOrbTransform();
    }
  });

  function startOrbObserver() {
    if (orbObserverStarted) return;
    orbObserverStarted = true;

    const target = document.querySelector("#view-total") || document.body;

    const observer = new MutationObserver(() => {
      scheduleOrbTransform();
    });

    observer.observe(target, {
      childList: true,
      subtree: true
    });
  }

  document.addEventListener("DOMContentLoaded", startOrbObserver);
  window.addEventListener("load", startOrbObserver);
})();

/* === CAPITALITAT_REMOVE_BOTTOM_LEGACY_BLOCKS === */

(() => {
  function norm(value) {
    return String(value ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function removeBottomLegacyBlocks() {
    const view = document.querySelector("#view-total");
    if (!view) return;

    const dashboard = view.querySelector("#cap-total-stable-dashboard");
    if (!dashboard) return;

    // 1. Elimina qualsevol element directe que vingui DESPRÉS del dashboard nou
    let foundDashboard = false;

    Array.from(view.children).forEach(child => {
      if (child === dashboard) {
        foundDashboard = true;
        return;
      }

      if (foundDashboard) {
        child.remove();
      }
    });

    // 2. Elimina blocs antics concrets si algun script els torna a injectar
    const legacySelectors = [
      "#cap-total-master",
      "#cap-clean-year-card",
      "#cap-year-final-card",
      "#cap-year-chart-elegant",
      ".cap-year-black-card",
      ".cap-year-chart-card",
      ".cap-month-chart-v3",
      ".cap-month-chart-v2",
      ".cap-month-chart-premium",
      ".cap-month-chart",
      ".capitalitat-five-charts-row",
      ".cap-summary-card",
      ".summary-card",
      ".stat-card",
      ".metric-card",
      ".kpi-card"
    ];

    legacySelectors.forEach(selector => {
      view.querySelectorAll(selector).forEach(el => {
        if (!el.closest("#cap-total-stable-dashboard")) {
          el.remove();
        }
      });
    });

    // 3. Elimina qualsevol bloc antic amb textos identificables
    Array.from(view.querySelectorAll("section, article, div")).forEach(el => {
      if (el.closest("#cap-total-stable-dashboard")) return;

      const text = norm(el.textContent);

      const isLegacy =
        text.includes("total de passis") ||
        text.includes("passis gestionats per nosaltres") ||
        text.includes("modalitat") && text.includes("categoria") && text.includes("districte") ||
        text.includes("activitats al llarg de l'any") ||
        text.includes("activitats al llarg de l’any");

      if (isLegacy) {
        // No toquem el títol principal INSCRIPCIONS de dalt
        if (!text.includes("inscripcions")) {
          el.remove();
        }
      }
    });
  }

  function scheduleRemoveBottomLegacyBlocks() {
    setTimeout(removeBottomLegacyBlocks, 100);
    setTimeout(removeBottomLegacyBlocks, 500);
    setTimeout(removeBottomLegacyBlocks, 1200);
    setTimeout(removeBottomLegacyBlocks, 2400);
    setTimeout(removeBottomLegacyBlocks, 4000);
  }

  document.addEventListener("DOMContentLoaded", scheduleRemoveBottomLegacyBlocks);
  window.addEventListener("load", scheduleRemoveBottomLegacyBlocks);

  document.addEventListener("click", event => {
    const btn = event.target.closest("button, .nav-pill, [data-view], .sidebar-item, .nav-item");
    if (!btn) return;

    const text = norm(btn.textContent);
    const view = btn.getAttribute("data-view") || "";

    if (view.includes("total") || text.includes("total") || text.includes("passis")) {
      scheduleRemoveBottomLegacyBlocks();
    }
  });

  // Vigilància per si algun script antic torna a crear els blocs
  window.addEventListener("load", () => {
    const view = document.querySelector("#view-total");
    if (!view) return;

    const observer = new MutationObserver(() => {
      removeBottomLegacyBlocks();
    });

    observer.observe(view, {
      childList: true,
      subtree: true
    });
  });
})();
