import { fetchAll, unwrap } from "../../data/supabase.js";

export function createImportsService(client) {
  const rpc = (name, values) => unwrap(client.rpc(name, values), "SQL 006");
  return {
    list: () =>
      fetchAll(
        () =>
          client
            .from("import_batches")
            .select("*")
            .order("created_at", { ascending: false })
            .order("id"),
        "SQL 006",
      ),
    latest: async () => {
      const records = await unwrap(
        client
          .from("import_batches")
          .select("id,created_at,undone_at")
          .is("undone_at", null)
          .order("created_at", { ascending: false })
          .order("id")
          .limit(1),
      );
      return records[0] || null;
    },
    preview: (records) => rpc("ops_preview_import", { p_records: records }),
    apply: (records, preview, name) =>
      rpc("ops_apply_import", {
        p_records: records,
        p_preview: preview,
        p_file_name: name,
      }),
    undo: (batch) => rpc("ops_undo_import", { p_batch: batch.id }),
    /** Copia de datos de la aplicación; no incluye contraseñas, JWT ni claves. */
    async backup() {
      const manifest = await rpc("ops_backup_manifest", {});
      const tables = manifest.tables;
      const data = {
        format: "panel-bajio-backup-v2",
        revisions: manifest.revisions,
        exported_at: new Date().toISOString(),
        tables: {},
      };
      // Secuencial para evitar una ráfaga de peticiones sobre el proyecto gratuito.
      for (const table of tables) {
        data.tables[table] = [];
        for (let offset = 0; ; offset += 500) {
          const page = await rpc("ops_backup_page", {
            p_table: table,
            p_offset: offset,
            p_limit: 500,
          });
          data.tables[table].push(...page);
          if (page.length < 500) break;
        }
      }
      const final = await rpc("ops_backup_manifest", {});
      if (
        JSON.stringify(final.revisions) !== JSON.stringify(manifest.revisions)
      )
        throw Error(
          "Los datos cambiaron durante el respaldo. Genera uno nuevo para conservar una copia consistente.",
        );
      data.counts = Object.fromEntries(
        tables.map((table) => [table, data.tables[table].length]),
      );
      return data;
    },
  };
}
