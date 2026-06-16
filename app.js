const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRWPBpxuBECSh1kLS1Vm-gdmOQhWw6_aBUUsjrX3wMZlaL17IsIkhFrSa8ovmbMR-uFL07SeX5ClGOM/pubhtml?gid=953396512&single=true";

const FALLBACK_COLS = {
  ID_INTERN: 1,       // B
  RESPONSABLE: 3,     // D
  IMPORTANT: 4,       // E
  MODALITAT: 12,      // M
  DATA_INICI: 13,     // N
  TIPUS_ENTRADA: 24   // Y
};

const RESPONSABLES = [
  "Marc",
  "Hotaru",
  "Laida",
  "Roger",
  "Cristian",
  "Neda"
];

const MESOS = ["Gen", "Feb", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Des"];

document.addEventListener("DOMContentLoaded", carregarDades);

async function carregarDades() {
  const status = document.getElementById("status");

  try {
    status.textContent = "Carregant dades del full INSCRIPCIONS...";

    const separator = CSV_URL.includes("?") ? "&" : "?";
    const response = await fetch(`${CSV_URL}${separator}t=${Date.now()}`);

    if (!response.ok) {
      throw new Error("No s'ha pogut carregar el CSV");
    }

    const csvText = await response.text();

    if (csvText.trim().startsWith("<")) {
      throw new Error("L'enllaç no sembla un CSV. Sembla una pàgina HTML.");
    }

    const rows = parseCSV(csvText);

    if (rows.length < 2) {
      throw new Error("El CSV no té dades suficients");
    }

    const dades = prepararDades(rows);
    renderitzarDades(dades);

    status.textContent =
      `Dades carregades · files CSV: ${dades.debug.filesCSV} · ` +
      `columnes CSV: ${dades.debug.columnesCSV} · ` +
      `columna ID: ${dades.debug.columnaIdIntern} · ` +
      `passis: ${dades.resum.totalPassis} · ` +
      `gestió TRUE: ${dades.resum.passisImportants}`;

    console.log("DEBUG VISOR", dades.debug);
    window.__VISOR_DEBUG__ = dades.debug;

  } catch (error) {
    console.error(error);
    status.textContent = "No s'han pogut carregar les dades. Revisa que l'enllaç sigui CSV i que apunti al full INSCRIPCIONS.";
  }
}

function prepararDades(rows) {
  const header = rows[0] || [];
  const dataRows = rows.slice(1);
  const columnes = detectarColumnes(header, dataRows);

  const passis = dataRows
    .map((row, index) => {
      const idIntern = getCell(row, columnes.ID_INTERN);

      if (!idIntern) return null;

      const important = valorEsTrue(getCell(row, columnes.IMPORTANT));
      const tipusEntradaOriginal = getCell(row, columnes.TIPUS_ENTRADA);
      const modalitatOriginal = getCell(row, columnes.MODALITAT);
      const responsableOriginal = getCell(row, columnes.RESPONSABLE);
      const dataIniciOriginal = getCell(row, columnes.DATA_INICI);
      const mesIndex = extreureMesIndex(dataIniciOriginal);

      return {
        fila: index + 2,
        idIntern,
        important,
        responsable: classificarResponsable(responsableOriginal),
        responsableOriginal,
        tipusEntrada: classificarTipusEntrada(tipusEntradaOriginal),
        tipusEntradaOriginal,
        modalitat: classificarModalitat(modalitatOriginal),
        modalitatOriginal,
        dataIniciOriginal,
        mesIndex
      };
    })
    .filter(Boolean);

  const passisImportants = passis.filter(passi => passi.important);

  const resum = {
    totalPassis: passis.length,
    passisImportants: passisImportants.length,

    tipusEntrada: comptarPerClau(passisImportants, "tipusEntrada", [
      "Gratuïta",
      "Gratuïta amb inscripció prèvia",
      "De pagament",
      "Sense informació"
    ]),

    modalitat: comptarPerClau(passisImportants, "modalitat", [
      "A",
      "B",
      "C",
      "Sense modalitat"
    ]),

    responsable: comptarPerClau(passisImportants, "responsable", [
      "Marc",
      "Hotaru",
      "Laida",
      "Roger",
      "Cristian",
      "Neda",
      "Altres",
      "Sense responsable"
    ]),

    activitatsPerMes: comptarPerMes(passis),
    activitatsPerMesGestio: comptarPerMes(passisImportants)
  };

  const debug = {
    filesCSV: dataRows.length,
    columnesCSV: header.length,
    headers: header,
    columnesDetectades: {
      ID_INTERN: columnes.ID_INTERN,
      RESPONSABLE: columnes.RESPONSABLE,
      IMPORTANT: columnes.IMPORTANT,
      MODALITAT: columnes.MODALITAT,
      DATA_INICI: columnes.DATA_INICI,
      TIPUS_ENTRADA: columnes.TIPUS_ENTRADA
    },
    columnaIdIntern: `${lletraColumna(columnes.ID_INTERN)} (${header[columnes.ID_INTERN] || "sense capçalera"})`,
    primersIds: passis.slice(0, 20).map(p => p.idIntern),
    passisDetectats: passis.length,
    passisTrueDetectats: passisImportants.length
  };

  return {
    resum,
    passis: passisImportants,
    debug
  };
}

function detectarColumnes(header, dataRows) {
  const normalitzats = header.map(h => normalitzarText(h));

  const buscarHeader = (opcions, fallback) => {
    for (const opcio of opcions) {
      const paraules = Array.isArray(opcio) ? opcio : [opcio];

      const index = normalitzats.findIndex(headerText =>
        paraules.every(paraula => headerText.includes(normalitzarText(paraula)))
      );

      if (index !== -1) return index;
    }

    return fallback;
  };

  let columnes = {
    ID_INTERN: buscarHeader([
      ["id", "intern"],
      ["id_intern"],
      ["idintern"]
    ], FALLBACK_COLS.ID_INTERN),

    RESPONSABLE: buscarHeader([
      ["responsable"],
      ["gestio"],
      ["gestió"],
      ["produccio"],
      ["producció"]
    ], FALLBACK_COLS.RESPONSABLE),

    IMPORTANT: buscarHeader([
      ["true"],
      ["propi"],
      ["propies"],
      ["pròpies"],
      ["gestio", "nosaltres"],
      ["gestió", "nosaltres"]
    ], FALLBACK_COLS.IMPORTANT),

    MODALITAT: buscarHeader([
      ["modalitat"],
      ["modalidad"]
    ], FALLBACK_COLS.MODALITAT),

    DATA_INICI: buscarHeader([
      ["data", "inici"],
      ["data_inici"],
      ["fecha", "inicio"],
      ["date", "start"]
    ], FALLBACK_COLS.DATA_INICI),

    TIPUS_ENTRADA: buscarHeader([
      ["tipus", "entrada"],
      ["tipo", "entrada"],
      ["entrada"],
      ["inscripcio"],
      ["inscripción"]
    ], FALLBACK_COLS.TIPUS_ENTRADA)
  };

  columnes.ID_INTERN = millorarColumnaIdIntern(columnes.ID_INTERN, header, dataRows);
  columnes.RESPONSABLE = detectarColumnaResponsable(columnes.RESPONSABLE, dataRows);

  return columnes;
}

function millorarColumnaIdIntern(columnaActual, header, dataRows) {
  const countActual = comptarNoBuits(dataRows, columnaActual);

  if (countActual > 20) return columnaActual;

  const candidats = header
    .map((h, index) => ({
      index,
      header: normalitzarText(h),
      count: comptarNoBuits(dataRows, index)
    }))
    .filter(c => c.header.includes("id"));

  if (!candidats.length) return columnaActual;

  candidats.sort((a, b) => b.count - a.count);

  if (candidats[0].count > countActual) {
    return candidats[0].index;
  }

  return columnaActual;
}

function detectarColumnaResponsable(columnaActual, dataRows) {
  const countActual = comptarResponsables(dataRows, columnaActual);
  let millorColumna = columnaActual;
  let millorCount = countActual;

  const maxCols = Math.max(...dataRows.slice(0, 50).map(row => row.length), 0);

  for (let col = 0; col < maxCols; col++) {
    const count = comptarResponsables(dataRows, col);

    if (count > millorCount) {
      millorCount = count;
      millorColumna = col;
    }
  }

  return millorColumna;
}

function comptarNoBuits(rows, col) {
  return rows.reduce((total, row) => {
    const value = getCell(row, col);
    return value ? total + 1 : total;
  }, 0);
}

function comptarResponsables(rows, col) {
  return rows.reduce((total, row) => {
    const value = normalitzarText(getCell(row, col));

    const match = RESPONSABLES.some(responsable =>
      value.includes(normalitzarText(responsable))
    );

    return match ? total + 1 : total;
  }, 0);
}

function renderitzarDades(data) {
  const resum = data.resum;

  posarText("kpi-total-passis", resum.totalPassis);
  posarText("kpi-passis-importants", resum.passisImportants);

  renderitzarAreaChartMesos(
    "chart-any-complet",
    resum.activitatsPerMes,
    "Totes les activitats"
  );

  renderitzarAreaChartMesos(
    "chart-any-gestio",
    resum.activitatsPerMesGestio,
    "Activitats gestionades per nosaltres"
  );

  renderitzarBarChart("chart-tipus-entrada", resum.tipusEntrada);
  renderitzarBarChart("chart-modalitat", resum.modalitat);
  renderitzarBarChart("chart-responsable", resum.responsable);

  renderitzarTaula(data.passis);
}

function comptarPerMes(items) {
  const mesos = new Array(12).fill(0);

  items.forEach(item => {
    if (Number.isInteger(item.mesIndex) && item.mesIndex >= 0 && item.mesIndex <= 11) {
      mesos[item.mesIndex]++;
    }
  });

  return mesos;
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
    const x = margin.left + (stepX * i);
    const y = baseY - ((valor / maxValor) * plotHeight);
    return { x, y, valor, mes: MESOS[i] };
  });

  const linePath = construirPathSuau(points);
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${baseY} L ${points[0].x} ${baseY} Z`;

  const horizontalTicks = obtenirTicksY(maxValor);
  const uid = containerId.replace(/[^a-zA-Z0-9]/g, "");

  const verticalGrid = points.map(point => `
    <line x1="${point.x}" y1="${margin.top}" x2="${point.x}" y2="${baseY}" class="chart-grid-vertical" />
  `).join("");

  const horizontalGrid = horizontalTicks.map(valor => {
    const y = baseY - ((valor / maxValor) * plotHeight);

    return `
      <line x1="${margin.left}" y1="${y}" x2="${margin.left + plotWidth}" y2="${y}" class="chart-grid-horizontal" />
      <text x="${margin.left - 12}" y="${y + 4}" text-anchor="end" class="chart-axis-label">${valor}</text>
    `;
  }).join("");

  const xLabels = points.map(point => `
    <text x="${point.x}" y="${baseY + 28}" text-anchor="middle" class="chart-axis-label">${point.mes}</text>
  `).join("");

  const pointDots = points.map(point => `
    <circle cx="${point.x}" cy="${point.y}" r="4.5" class="chart-point-glow" />
    <circle cx="${point.x}" cy="${point.y}" r="2.5" class="chart-point-core" />
  `).join("");

  container.innerHTML = `
    <div class="chart-meta">
      <span class="chart-kicker">${subtitol}</span>
      <span class="chart-side-label">Número d'activitats</span>
    </div>

    <svg viewBox="0 0 ${width} ${height}" class="mountain-chart" role="img" aria-label="${subtitol} per mesos">
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

      ${pointDots}
      ${xLabels}
    </svg>
  `;
}

function obtenirTicksY(maxValor) {
  const ticks = [maxValor, Math.round(maxValor * 0.66), Math.round(maxValor * 0.33), 0];
  return [...new Set(ticks)].sort((a, b) => b - a);
}

function arrodonirMaxGrafic(valor) {
  if (valor <= 5) return 5;
  if (valor <= 10) return 10;
  if (valor <= 20) return Math.ceil(valor / 2) * 2;
  if (valor <= 50) return Math.ceil(valor / 5) * 5;
  return Math.ceil(valor / 10) * 10;
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

function renderitzarBarChart(containerId, objecte) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const entries = Object.entries(objecte);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  const max = Math.max(...entries.map(([, value]) => value), 1);

  container.innerHTML = entries
    .map(([label, valor]) => {
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
    })
    .join("");
}

function renderitzarTaula(passis) {
  const tbody = document.getElementById("taula-passis-body");
  if (!tbody) return;

  if (!passis.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">No s'han trobat passis amb TRUE a la columna E.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = passis
    .slice(0, 300)
    .map(passi => `
      <tr>
        <td>${escaparHTML(passi.idIntern)}</td>
        <td>${escaparHTML(passi.responsable)}</td>
        <td>${escaparHTML(passi.tipusEntrada)}</td>
        <td>${escaparHTML(passi.modalitat)}</td>
        <td>${passi.fila}</td>
      </tr>
    `)
    .join("");
}

function comptarPerClau(items, key, clausInicials) {
  const resultat = {};

  clausInicials.forEach(clau => {
    resultat[clau] = 0;
  });

  items.forEach(item => {
    const valor = item[key] || clausInicials[clausInicials.length - 1];

    if (resultat[valor] === undefined) {
      resultat[clausInicials[clausInicials.length - 1]]++;
    } else {
      resultat[valor]++;
    }
  });

  return resultat;
}

function classificarTipusEntrada(valor) {
  const text = normalitzarText(valor);

  if (!text) return "Sense informació";

  if (text.includes("inscripcio")) {
    return "Gratuïta amb inscripció prèvia";
  }

  if (text.includes("pagament") || text.includes("pago")) {
    return "De pagament";
  }

  if (text.includes("gratuita") || text.includes("gratuit")) {
    return "Gratuïta";
  }

  return "Sense informació";
}

function classificarModalitat(valor) {
  const text = String(valor || "").trim().toUpperCase();

  if (["A", "B", "C"].includes(text)) {
    return text;
  }

  return "Sense modalitat";
}

function classificarResponsable(valor) {
  const text = normalitzarText(valor);

  if (!text) return "Sense responsable";

  for (const responsable of RESPONSABLES) {
    if (text.includes(normalitzarText(responsable))) {
      return responsable;
    }
  }

  return "Altres";
}

function valorEsTrue(valor) {
  const text = normalitzarText(valor);

  return (
    text === "true" ||
    text === "verdadero" ||
    text === "cert" ||
    text === "si" ||
    text === "sí"
  );
}

function extreureMesIndex(valor) {
  const text = String(valor || "").trim();

  if (!text) return null;

  const formatDMY = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (formatDMY) {
    const mes = parseInt(formatDMY[2], 10);
    if (mes >= 1 && mes <= 12) return mes - 1;
  }

  const formatYMD = text.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (formatYMD) {
    const mes = parseInt(formatYMD[2], 10);
    if (mes >= 1 && mes <= 12) return mes - 1;
  }

  const data = new Date(text);
  if (!Number.isNaN(data.getTime())) {
    return data.getMonth();
  }

  return null;
}

function normalitzarText(valor) {
  return String(valor || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getCell(row, index) {
  return String(row[index] || "").trim();
}

function posarText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}

function escaparHTML(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function lletraColumna(index) {
  let num = index + 1;
  let text = "";

  while (num > 0) {
    const mod = (num - 1) % 26;
    text = String.fromCharCode(65 + mod) + text;
    num = Math.floor((num - mod) / 26);
  }

  return text;
}

function detectarSeparador(text) {
  const firstLine = text.split(/\r?\n/)[0] || "";
  const separators = [",", ";", "\t"];
  let best = ",";
  let bestCount = -1;

  separators.forEach(separator => {
    let count = 0;
    let insideQuotes = false;

    for (let i = 0; i < firstLine.length; i++) {
      const char = firstLine[i];

      if (char === '"') insideQuotes = !insideQuotes;
      if (char === separator && !insideQuotes) count++;
    }

    if (count > bestCount) {
      bestCount = count;
      best = separator;
    }
  });

  return best;
}

function parseCSV(text) {
  const delimiter = detectarSeparador(text);
  const rows = [];
  let row = [];
  let cell = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"' && insideQuotes && nextChar === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === delimiter && !insideQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i++;
      }

      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);

  return rows.filter(r => r.some(c => String(c).trim() !== ""));
}
