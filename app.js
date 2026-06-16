const DATA_URL = "data/inscripcions.json";

const MESOS_KEYS = [
  "gener", "febrer", "marc", "abril", "maig", "juny",
  "juliol", "agost", "setembre", "octubre", "novembre", "desembre"
];

const MESOS_LABELS = [
  "Gen", "Feb", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Oct", "Nov", "Des"
];

let APP_DATA = null;
let AUTOGESTIONADES = [];
let COLUMN_KEYS = {};

document.addEventListener("DOMContentLoaded", () => {
  activarNavegacio();
  carregarDades();
});

function activarNavegacio() {
  const buttons = document.querySelectorAll(".nav-pill");
  const views = document.querySelectorAll(".view");

  buttons.forEach(button => {
    button.addEventListener("click", () => {
      const viewId = button.dataset.view;

      buttons.forEach(btn => btn.classList.remove("active"));
      views.forEach(view => view.classList.remove("active"));

      button.classList.add("active");
      document.getElementById(viewId)?.classList.add("active");
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

  posarText("kpi-total-passis", summary.totalPassis || rows.length || 0);
  posarText("kpi-passis-importants", summary.passisGestio || 0);

  renderitzarAreaChartMesos(
    "chart-any-complet",
    objecteMesosAArray(summary.activitatsPerMes),
    "Totes les activitats"
  );

  renderitzarAreaChartMesos(
    "chart-any-gestio",
    objecteMesosAArray(summary.activitatsGestioPerMes),
    "Activitats gestionades per nosaltres"
  );

  renderitzarBarChart("chart-tipus-entrada", summary.tipusEntrada || {});
  renderitzarBarChart("chart-modalitat", summary.modalitat || {});
  renderitzarBarChart("chart-responsable", summary.responsable || {});

  AUTOGESTIONADES = rows.filter(row => valorEsTrue(row[COLUMN_KEYS.gestio]));
  renderitzarTaulaAutogestionades(AUTOGESTIONADES);
  activarCercadorAutogestionades();
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
