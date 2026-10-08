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
      const tables = [
        "profiles",
        "loads",
        "comments",
        "incidents",
        "load_history",
        "communications",
        "pending_loads",
        "pending_load_comments",
        "pending_load_history",
        "reserved_loads",
        "reserved_load_history",
        "customer_assignments",
        "load_followers",
        "user_following",
        "shift_tasks",
        "shift_task_history",
        "shift_closures",
        "message_templates",
        "portal_access",
        "admin_events",
        "import_batches",
        "import_rows",
        "radar_sources",
        "geo_places",
      ];
      const data = {
        format: "panel-bajio-backup-v1",
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
      return data;
    },
  };
}
