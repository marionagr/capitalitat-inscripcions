import fs from "fs";

const apiUrl = process.env.API_URL;

if (!apiUrl) {
  console.error("ERROR: falta API_URL.");
  console.error('Primer executa: export API_URL="https://script.google.com/macros/s/XXXXX/exec"');
  process.exit(1);
}

const separator = apiUrl.includes("?") ? "&" : "?";
const url = `${apiUrl}${separator}t=${Date.now()}`;

console.log("Descarregant JSON...");
console.log(url);

const response = await fetch(url);

if (!response.ok) {
  throw new Error(`Error HTTP ${response.status}`);
}

const text = await response.text();

if (text.trim().startsWith("<")) {
  console.error("ERROR: la URL retorna HTML, no JSON.");
  console.error("Revisa que sigui la URL /exec, no /dev.");
  process.exit(1);
}

let data;

try {
  data = JSON.parse(text);
} catch (error) {
  console.error("ERROR: la resposta no és JSON vàlid.");
  console.error(text.slice(0, 500));
  process.exit(1);
}

if (!data.rows || !Array.isArray(data.rows)) {
  console.error("ERROR: el JSON no té rows.");
  console.error("Claus disponibles:", Object.keys(data));
  process.exit(1);
}

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/inscripcions.json", JSON.stringify(data, null, 2), "utf8");

console.log("");
console.log("JSON guardat correctament a data/inscripcions.json");
console.log("Full:", data.meta?.sheet);
console.log("Files exportades:", data.meta?.exportedRows);
console.log("Columnes exportades:", data.meta?.exportedColumns);
console.log("Total passis:", data.summary?.totalPassis);
console.log("Passis gestió:", data.summary?.passisGestio);
console.log("Columnes no trobades:", data.meta?.missingColumns?.length ?? "no indicat");
