import { createImportsService } from "../../features/imports/service.js";
import { booleanFields, dateFields, marked } from "../../load-rules.js";
import { date } from "./models.js";

/** La vista previa y la confirmación usan las mismas filas y versiones; no importan a ciegas. */
export function importMethods(ctx) {
  const service = createImportsService(ctx.client);
  let prepared = null;
  function normalize(records) {
    const unique = new Map(),
      repeated = [];
    let skipped = 0;
    for (const raw of records) {
      const load = String(raw.load ?? "").trim();
      if (!load) {
        skipped += 1;
        continue;
      }
      const row = { ...raw, load };
      for (const field of booleanFields)
        if (field in row) row[field] = String(marked(row[field]));
      for (const field of dateFields)
        if (field in row) row[field] = date(row[field]);
      // La misma carga repetida en el archivo conserva la última fila, como el original.
      if (unique.has(load)) repeated.push(load);
      unique.set(load, row);
    }
    return {
      records: [...unique.values()],
      skipped,
      repeated: [...new Set(repeated)],
    };
  }
  async function preview(records) {
    ctx.staff(true);
    const normalized = normalize(records);
    const [details, assignments] = await Promise.all([
      service.preview(normalized.records),
      ctx.rows("customer_assignments", (query) => query, "customer_key"),
    ]);
    const assigned = new Set(
      assignments.map((row) => row.customer.trim().toLowerCase()),
    );
    const summary = {
      ok: true,
      inserted: details.filter((row) => row.new).length,
      updated: details.filter((row) => !row.new && row.changes.length).length,
      unchanged: details.filter((row) => !row.new && !row.changes.length)
        .length,
      skipped: normalized.skipped,
      total: records.length,
      citasMovidas: details.filter(
        (row) =>
          !row.new &&
          row.changes.some((field) =>
            ["pickup_appt", "delivery_appt"].includes(field),
          ),
      ).length,
      clientesSinCsr: [
        ...new Set(
          normalized.records
            .map((row) => row.customer)
            .filter(
              (customer) =>
                customer && !assigned.has(customer.trim().toLowerCase()),
            ),
        ),
      ].sort(),
      duplicadosEnArchivo: normalized.repeated,
      vistaPrevia: true,
    };
    prepared = {
      input: JSON.stringify(records),
      records: normalized.records,
      details,
      summary,
      epoch: ctx.epoch,
    };
    return summary;
  }
  return {
    previewImport: preview,
    importLoads: async (records) => {
      ctx.staff(true);
      if (
        !prepared ||
        prepared.epoch !== ctx.epoch ||
        prepared.input !== JSON.stringify(records)
      )
        throw Error("Genera una nueva vista previa antes de importar.");
      const snapshot = prepared;
      prepared = null;
      await service.apply(
        snapshot.records,
        snapshot.details,
        "Importación del panel original",
      );
      return { ...snapshot.summary, vistaPrevia: false };
    },
    getImportInfo: async () => {
      if (!ctx.profile)
        return { lastImportAt: "", backupAt: "", canUndo: false };
      return ctx.rpc("ops_original_import_info");
    },
    deshacerUltimaImportacion: async () => {
      ctx.staff(true);
      const batch = (await service.list()).find((row) => !row.undone_at);
      if (!batch)
        throw Error("No hay una importación disponible para deshacer.");
      await service.undo(batch);
      return {
        ok: true,
        restauradas: (
          await ctx.rows("import_rows", (query) =>
            query.eq("batch_id", batch.id),
          )
        ).length,
      };
    },
  };
}
