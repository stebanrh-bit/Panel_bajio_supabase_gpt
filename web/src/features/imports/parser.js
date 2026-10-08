import { readSheet } from "read-excel-file/browser";

// Se aceptan los encabezados del Excel anterior y los nombres del esquema nuevo.
const aliases = {
  load: ["load", "carga", "número de carga"],
  customer: ["customers", "customer", "cliente"],
  origin_city: ["city o.", "origen", "ciudad de origen"],
  origin_state: ["state o."],
  origin_address: ["from"],
  dest_city: ["city d.", "destino", "ciudad de destino"],
  dest_state: ["state d."],
  dest_address: ["to"],
  pickup_appt: ["pickup appt."],
  pickup_actual: ["leg from in date"],
  pickup_delta_min: ["on time pickup"],
  delivery_appt: ["delivery appt."],
  delivery_actual: ["leg to in date"],
  delivery_delta_min: ["on time"],
  truck: ["truck", "unidad"],
  trailer: ["trailer", "remolque"],
  work_order: ["work order"],
  bol: ["bol"],
  doc_status: ["doc. status"],
  doda: ["doda"],
  entry: ["entry"],
  tracking_link: ["link de rastreo"],
  exportacion: ["exportacion"],
  importacion: ["importacion"],
  pedimentos: ["pedimentos"],
  regresos: ["regresos"],
  sobre_listo: ["sobre listo"],
  loaded_miles: ["l.mi"],
  empty_miles: ["e.mi."],
  rpm: ["rpm"],
  charges: ["charges"],
};
const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.\s]+/g, "")
    .trim();
const headers = new Map(
  Object.entries(aliases).flatMap(([field, names]) =>
    [field, ...names].map((name) => [normalize(name), field]),
  ),
);
const dateColumns = new Set([
  "pickup_appt",
  "pickup_actual",
  "delivery_appt",
  "delivery_actual",
]);

/** CSV con comillas, comillas escapadas, saltos internos y separador coma o punto y coma. */
export function parseCsv(text) {
  text = String(text).replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/)[0];
  const countOutsideQuotes = (separator) => {
    let quoted = false,
      count = 0;
    for (let i = 0; i < firstLine.length; i++) {
      if (firstLine[i] === '"') quoted = !quoted;
      else if (!quoted && firstLine[i] === separator) count++;
    }
    return count;
  };
  const separator =
    countOutsideQuotes(";") > countOutsideQuotes(",") ? ";" : ",";
  const rows = [];
  let row = [],
    cell = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === separator) {
      row.push(cell);
      cell = "";
      closed = false;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      closed = false;
    } else {
      if (closed && char.trim())
        throw new Error(
          "El CSV tiene texto después de cerrar una celda entre comillas.",
        );
      if (!closed) cell += char;
    }
  }
  if (quoted) throw new Error("El CSV contiene comillas sin cerrar.");
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Las horas de Excel representan hora local, no un desplazamiento UTC del archivo. */
function dateValue(value, rowNumber, field) {
  if (value == null || value === "") return "";
  let date;
  if (value instanceof Date)
    date = new Date(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
      value.getUTCHours(),
      value.getUTCMinutes(),
      value.getUTCSeconds(),
    );
  else {
    const text = String(value).trim();
    if (
      !/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(
        text,
      )
    )
      throw new Error(
        `Fila ${rowNumber}: ${field} debe usar AAAA-MM-DD HH:MM o una fecha ISO.`,
      );
    const wall = text.replace(" ", "T");
    date = new Date(wall.length === 10 ? wall + "T00:00" : wall);
    if (!Number.isNaN(date.getTime()) && !/[Z+-]\d{2}:\d{2}$|Z$/.test(wall)) {
      const [year, month, day] = wall.slice(0, 10).split("-").map(Number);
      if (
        date.getFullYear() !== year ||
        date.getMonth() + 1 !== month ||
        date.getDate() !== day
      )
        throw new Error(`Fila ${rowNumber}: fecha inexistente en ${field}.`);
    }
  }
  if (Number.isNaN(date.getTime()))
    throw new Error(`Fila ${rowNumber}: fecha inválida en ${field}.`);
  return date.toISOString();
}

/** Valida el archivo entero antes de solicitar una vista previa al servidor. */
export function rowsToLoads(rows) {
  const headerIndex = rows
    .slice(0, 15)
    .findIndex((row) =>
      row.some((cell) => headers.get(normalize(cell)) === "load"),
    );
  if (headerIndex < 0)
    throw new Error("No se encontró el encabezado Load o Número de carga.");
  const columns = rows[headerIndex].map((cell) => headers.get(normalize(cell)));
  const mapped = columns.filter(Boolean);
  if (new Set(mapped).size !== mapped.length)
    throw new Error(
      "El archivo tiene encabezados repetidos para el mismo campo.",
    );
  const records = [],
    seen = new Set();
  for (let index = headerIndex + 1; index < rows.length; index++) {
    const cells = rows[index];
    if (cells.every((value) => value == null || String(value).trim() === ""))
      continue;
    const record = {};
    columns.forEach((field, column) => {
      if (!field) return;
      const value = cells[column];
      record[field] = dateColumns.has(field)
        ? dateValue(value, index + 1, field)
        : String(value ?? "").trim();
    });
    if (!record.load || record.load.length > 200)
      throw new Error(`Fila ${index + 1}: falta un número de carga válido.`);
    if (seen.has(record.load))
      throw new Error(`Carga duplicada en el archivo: ${record.load}.`);
    seen.add(record.load);
    records.push(record);
    if (records.length > 1000)
      throw new Error("Divide el archivo en lotes de hasta 1000 cargas.");
  }
  if (!records.length) throw new Error("El archivo no contiene cargas.");
  return records;
}

export async function parseLoadFile(file) {
  if (!file || file.size > 10 * 1024 * 1024)
    throw new Error("Selecciona un archivo de hasta 10 MB.");
  if (/\.csv$/i.test(file.name))
    return rowsToLoads(parseCsv(await file.text()));
  if (/\.xlsx$/i.test(file.name)) return rowsToLoads(await readSheet(file));
  throw new Error(
    "Usa .xlsx o .csv. Convierte los archivos .xls a .xlsx antes de cargarlos.",
  );
}
