import { readSheet } from "read-excel-file/web-worker";
import { parseCsv, rowsToLoads } from "../features/imports/parser.js";
/** Leer, descomprimir y convertir archivos fuera del hilo que atiende al usuario. */
self.onmessage = async ({ data: { file, id, raw = false } }) => {
  try {
    self.postMessage({ id, progress: "Leyendo archivo…" });
    let rows;
    if (/\.csv$/i.test(file.name)) rows = parseCsv(await file.text());
    else if (/\.xlsx$/i.test(file.name)) rows = await readSheet(file);
    else if (/\.xls$/i.test(file.name)) {
      if (!self.XLSX)
        importScripts(
          "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
        );
      const book = self.XLSX.read(await file.arrayBuffer(), {
        type: "array",
        cellDates: true,
      });
      rows = self.XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], {
        header: 1,
        defval: "",
      });
      rows = rows.map((row) =>
        row.map((v) =>
          v instanceof Date
            ? new Date(
                Date.UTC(
                  v.getFullYear(),
                  v.getMonth(),
                  v.getDate(),
                  v.getHours(),
                  v.getMinutes(),
                  v.getSeconds(),
                ),
              )
            : v,
        ),
      );
    } else throw Error("Selecciona un archivo .xlsx, .xls o .csv.");
    self.postMessage({ id, progress: "Validando filas…" });
    const records = raw
      ? rows
      : rowsToLoads(rows, { allowDuplicates: true, skipMissingLoads: true });
    for (const record of raw ? [] : records)
      for (const field of ["pickup_delta_min", "delivery_delta_min"])
        if (field in record) {
          const text = String(record[field] ?? "").trim(),
            m = text.match(/^(-?)(\d+):([0-5]\d)$/);
          if (m)
            record[field] = String(
              (Number(m[2]) * 60 + Number(m[3])) * (m[1] ? -1 : 1),
            );
          else if (text && !/^-?\d+(?:\.\d+)?$/.test(text))
            throw Error(
              "El desfase debe indicar minutos o una duración como -01:30.",
            );
        }
    self.postMessage({ id, records });
  } catch (error) {
    self.postMessage({
      id,
      error: error.message || "No se pudo leer el archivo.",
    });
  }
};
