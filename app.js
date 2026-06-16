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


/* === CAPITALITAT_V3_START === */

/* ============================================================
   CAPITALITAT V3 · INTRO CINEMÀTICA
   Logo lluminós → títol epic → línia → dates → % + anell
============================================================ */

window.addEventListener("load", () => {
  try {
    activarAnimacioLogoCapitalitat();
    activarIntroInicialCapitalitat();
  } catch (e) {
    console.error("Capitalitat V3 init error:", e);
  }
});

function activarAnimacioLogoCapitalitat() {
  const logoTrigger = document.querySelector(".brand-block") || document.querySelector(".brand-logo");
  if (!logoTrigger) return;

  logoTrigger.style.cursor = "pointer";
  logoTrigger.setAttribute("title", "Veure progrés de la Capitalitat");

  if (!logoTrigger.dataset.capitalitatV3Bound) {
    logoTrigger.addEventListener("click", () => {
      mostrarExperienciaCapitalitatV3();
    });
    logoTrigger.dataset.capitalitatV3Bound = "1";
  }
}

function activarIntroInicialCapitalitat() {
  if (window.__capitalitatV3IntroDone) return;
  window.__capitalitatV3IntroDone = true;

  window.setTimeout(() => {
    mostrarExperienciaCapitalitatV3();
  }, 650);
}

// Compatibilitat amb funcions anteriors
function mostrarAnimacioCapitalitat() {
  mostrarExperienciaCapitalitatV3();
}
function mostrarIntroInicialCapitalitat() {
  mostrarExperienciaCapitalitatV3();
}
function mostrarExperienciaCapitalitatFinal() {
  mostrarExperienciaCapitalitatV3();
}

function mostrarExperienciaCapitalitatV3() {
  document.querySelectorAll(
    "#capitalitat-progress-overlay, #capitalitat-intro-overlay, #capitalitat-cinematic-overlay, #capitalitat-final-overlay, #capitalitat-v3-overlay"
  ).forEach(el => el.remove());

  const progress = calcularProgresCapitalitat();

  const overlay = document.createElement("div");
  overlay.id = "capitalitat-v3-overlay";
  overlay.className = "capitalitat-v3-overlay";
  overlay.innerHTML = `
    <button class="cv3-close" type="button" aria-label="Tancar animació">×</button>

    <div class="cv3-logo-stage">
      <div class="cv3-logo-real"></div>
      <div class="cv3-logo-glow"></div>
      <div class="cv3-logo-scan"></div>
    </div>

    <div class="cv3-seed"></div>

    <div class="cv3-title">
      <span>Barcelona 2026</span>
      <strong>Capital Mundial de l'Arquitectura</strong>
    </div>

    <div class="cv3-timeline">
      <span class="cv3-date cv3-date-left">12 de febrer</span>
      <span class="cv3-date cv3-date-right">13 de desembre</span>
      <span class="cv3-line"></span>
    </div>

    <div class="cv3-progress">
      <div class="cv3-ring">
        <svg viewBox="0 0 220 220" aria-hidden="true">
          <circle class="cv3-ring-bg" cx="110" cy="110" r="92"></circle>
          <circle class="cv3-ring-progress" cx="110" cy="110" r="92" data-cv3-circle></circle>
        </svg>

        <div class="cv3-number">
          <strong data-cv3-number>0%</strong>
          <span>dies transcorreguts</span>
        </div>
      </div>

      <p>${progress.remainingDays > 0 ? `Falten ${progress.remainingDays} dies per acabar la Capitalitat` : "La Capitalitat ha finalitzat"}</p>
    </div>
  `;

  document.body.appendChild(overlay);

  const circle = overlay.querySelector("[data-cv3-circle]");
  const numberEl = overlay.querySelector("[data-cv3-number]");

  if (circle) {
    const radius = Number(circle.getAttribute("r"));
    const circumference = 2 * Math.PI * radius;
    circle.style.strokeDasharray = `${circumference}`;
    circle.style.strokeDashoffset = `${circumference}`;
  }

  overlay.addEventListener("click", event => {
    if (event.target === overlay || event.target.closest(".cv3-close")) {
      overlay.classList.add("is-closing");
      window.setTimeout(() => overlay.remove(), 550);
    }
  });

  requestAnimationFrame(() => {
    overlay.classList.add("is-active");
  });

  // El text del % apareix a 0 i puja ràpidament mentre es completa l'anell
  window.setTimeout(() => {
    animarPercentatgeCapitalitat(numberEl, circle, progress.percent, 1650);
  }, 9900);
}

function animarPercentatgeCapitalitat(numberEl, circleEl, targetPercent, duration = 1650) {
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
    const eased = 1 - Math.pow(1 - t, 3); // ease out
    const current = Math.round(targetPercent * eased);

    if (numberEl) {
      numberEl.textContent = `${current}%`;
    }

    if (circleEl) {
      const offset = circumference - (current / 100) * circumference;
      circleEl.style.strokeDashoffset = `${offset}`;
    }

    if (t < 1) {
      requestAnimationFrame(frame);
    }
  }

  requestAnimationFrame(frame);
}

function calcularProgresCapitalitat() {
  const MS_DIA = 24 * 60 * 60 * 1000;

  const inici = new Date(2026, 1, 12);   // 12 febrer 2026
  const final = new Date(2026, 11, 13);  // 13 desembre 2026

  const ara = new Date();
  const avui = new Date(ara.getFullYear(), ara.getMonth(), ara.getDate());

  const totalDies = Math.max(1, Math.round((final - inici) / MS_DIA));
  const diesPassats = Math.round((avui - inici) / MS_DIA);
  const remainingDays = Math.max(0, Math.ceil((final - avui) / MS_DIA));
  const percent = Math.min(100, Math.max(0, Math.round((diesPassats / totalDies) * 100)));

  return { percent, remainingDays };
}
