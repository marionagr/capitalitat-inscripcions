const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRWPBpxuBECSh1kLS1Vm-gdmOQhWw6_aBUUsjrX3wMZlaL17IsIkhFrSa8ovmbMR-uFL07SeX5ClGOM/pub?gid=953396512&single=true&output=csv";

const COLS = {
  ID_INTERN: 1,       // B
  TITOL: 3,           // D
  IMPORTANT: 4,       // E
  MODALITAT: 12,      // M
  TIPUS_ENTRADA: 24   // Y
};

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
    status.textContent = "No s'han pogut carregar les dades. Revisa que l'enllaç sigui CSV i que la pestanya estigui publicada.";
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

      return {
        fila: index + 2,
        idIntern,
        titol: getCell(row, COLS.TITOL),
        important,
        tipusEntrada: classificarTipusEntrada(tipusEntradaOriginal),
        tipusEntradaOriginal,
        modalitat: classificarModalitat(modalitatOriginal)
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

  renderitzarGrid("tipus-entrada-grid", resum.tipusEntrada);
  renderitzarGrid("modalitat-grid", resum.modalitat);
  renderitzarTaula(data.passis);
}

function renderitzarGrid(containerId, objecte) {
  const container = document.getElementById(containerId);

  container.innerHTML = Object.entries(objecte)
    .map(([label, valor]) => `
      <article class="mini-card">
        <span>${escaparHTML(label)}</span>
        <strong>${valor}</strong>
      </article>
    `)
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
        <td>${escaparHTML(passi.titol || "Sense títol")}</td>
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

function valorEsTrue(valor) {
  const text = normalitzarText(valor);

  return (
    valor === true ||
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

/**
 * Parser CSV senzill però preparat per comes, cometes i salts de línia dins de cel·les.
 */
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
