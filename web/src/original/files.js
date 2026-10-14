import { readSheet } from "read-excel-file/browser";
import { parseCsv, rowsToLoads } from "../features/imports/parser.js";

/** Convertir el desfase TMS firmado, por ejemplo -01:30, a minutos. */
function deltaMinutes(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return text;
  const match = text.match(/^(-?)(\d+):([0-5]\d)$/);
  if (!match)
    throw Error("El desfase debe indicar minutos o una duración como -01:30.");
  return String(
    (Number(match[2]) * 60 + Number(match[3])) * (match[1] ? -1 : 1),
  );
}

/** XLSX/CSV se leen con las bibliotecas incluidas; .xls conserva el lector heredado. */
export async function parseLoadFile(file, readLegacy) {
  if (!file || file.size > 10 * 1024 * 1024)
    throw Error("Selecciona un archivo de hasta 10 MB.");
  let rows;
  if (/\.csv$/i.test(file.name)) rows = parseCsv(await file.text());
  else if (/\.xlsx$/i.test(file.name)) rows = await readSheet(file);
  else if (/\.xls$/i.test(file.name) && readLegacy) {
    rows = await readLegacy(file);
    // SheetJS devuelve fechas locales; el lector XLSX incluido devuelve componentes UTC.
    // Igualar ambos formatos antes de la conversión de hora local a ISO.
    rows = rows.map((row) =>
      row.map((value) => {
        if (!(value instanceof Date)) return value;
        return new Date(
          Date.UTC(
            value.getFullYear(),
            value.getMonth(),
            value.getDate(),
            value.getHours(),
            value.getMinutes(),
            value.getSeconds(),
          ),
        );
      }),
    );
  } else throw Error("Selecciona un archivo .xlsx, .xls o .csv.");
  // El original descarta filas sin load y conserva la última fila de los loads repetidos.
  // El adaptador genera la advertencia de duplicados antes de guardar.
  const records = rowsToLoads(rows, {
    allowDuplicates: true,
    skipMissingLoads: true,
  });
  for (const record of records) {
    for (const field of ["pickup_delta_min", "delivery_delta_min"])
      if (field in record) record[field] = deltaMinutes(record[field]);
  }
  return records;
}
