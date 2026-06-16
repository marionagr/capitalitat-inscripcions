const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRWPBpxuBECSh1kLS1Vm-gdmOQhWw6_aBUUsjrX3wMZlaL17IsIkhFrSa8ovmbMR-uFL07SeX5ClGOM/pub?gid=953396512&single=true&output=csv";

const COLS = {
  ID_INTERN: 1,       // B
  RESPONSABLE: 3,     // D
  IMPORTANT: 4,       // E
  MODALITAT: 12,      // M
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
    const rows = parseCSV(csvText);

    if (rows.length < 2) {
      throw new Error("El CSV no té dades suficients");
    }

    const dades = prepararDades(rows);
    renderitzarDades(dades);

    status.textContent = `Dades carregades correctament · ${new Date().toLocaleString("ca-ES")}`;
  } catch (error) {
    console.error(error);
    status.textContent = "No s'han pogut carregar les dades. Revisa l'enllaç CSV o la publicació del full.";
  }
}

function prepararDades(rows) {
  const dataRows = rows.slice(1);

  const passis = dataRows
    .map((row, index) => {
      const idIntern = getCell(row, COLS.ID_INTERN);

      if (!idIntern) return null;

      const important = valorEsTrue(getCell(row, COLS.IMPORTANT));
      const tipusEntradaOriginal = getCell(row, COLS.TIPUS_ENTRADA);
      const modalitatOriginal = getCell(row, COLS.MODALITAT);
      const responsableOriginal = getCell(row, COLS.RESPONSABLE);

      return {
        fila: index + 2,
        idIntern,
        important,
        responsable: classificarResponsable(responsableOriginal),
        responsableOriginal,
        tipusEntrada: classificarTipusEntrada(tipusEntradaOriginal),
        tipusEntradaOriginal,
        modalitat: classificarModalitat(modalitatOriginal),
        modalitatOriginal
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
    ])
  };

  return {
    resum,
    passis: passisImportants
  };
}

function renderitzarDades(data) {
  const resum = data.resum;

  posarText("kpi-total-passis", resum.totalPassis);
  posarText("kpi-passis-importants", resum.passisImportants);

  renderitzarBarChart("chart-tipus-entrada", resum.tipusEntrada);
  renderitzarBarChart("chart-modalitat", resum.modalitat);
  renderitzarBarChart("chart-responsable", resum.responsable);

  renderitzarTaula(data.passis);
}

function renderitzarBarChart(containerId, objecte) {
  const container = document.getElementById(containerId);
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

function parseCSV(text) {
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
    } else if (char === "," && !insideQuotes) {
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
