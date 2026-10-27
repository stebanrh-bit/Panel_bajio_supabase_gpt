import { marked } from "../../load-rules.js";
import { unwrap } from "../../data/supabase.js";
/** Métodos personales: el dueño y los permisos se obtienen siempre de la sesión real. */
export function personalMethods(ctx) {
  const call = (name, args = {}) =>
    ctx.safe(
      unwrap(ctx.client.rpc(name, args), "SQL 020 de consolidación personal"),
    );
  return {
    getPreferenciasPersonales: async () => {
      ctx.staff();
      const row = await ctx.safe(
        unwrap(
          ctx.client
            .from("original_preferences")
            .select("personal_ui")
            .eq("user_id", ctx.profile.id)
            .maybeSingle(),
          "SQL 020 de consolidación personal",
        ),
      );
      return { ok: true, preferences: row?.personal_ui || {} };
    },
    guardarPreferenciasPersonales: async (patch) => {
      ctx.staff(true);
      return {
        ok: true,
        preferences: await call("ops_save_personal_ui", { p_patch: patch }),
      };
    },
    sincronizarAvisosPersonales: async (changes = []) => {
      ctx.staff();
      return {
        ok: true,
        items: await call("ops_notice_state", { p_changes: changes }),
      };
    },
    getEstadoSitio: async () => {
      ctx.staff();
      return { ok: true, ...(await call("ops_site_status")) };
    },
    getEstadoMillas: async () => {
      ctx.staff(true);
      if (ctx.profile.role !== "admin")
        throw Error("Solo Admin puede consultar el proceso de millas.");
      return { ok: true, ...(await call("ops_miles_dashboard")) };
    },
    getDocumentosCarga: async (load) => {
      ctx.staff();
      const items = await ctx.rows(
        "load_document_links",
        (q) => q.eq("load", load).is("deleted_at", null),
        "created_at",
      );
      return { ok: true, items };
    },
    guardarDocumentoCarga: async (load, id, version, values) => {
      ctx.staff(true);
      return {
        ok: true,
        record: await call("ops_save_document_link", {
          p_load: load,
          p_id: id || null,
          p_version: version || null,
          p_kind: values.kind,
          p_label: values.label,
          p_url: values.url,
        }),
      };
    },
    quitarDocumentoCarga: async (id, version) => {
      ctx.staff(true);
      await call("ops_remove_document_link", { p_id: id, p_version: version });
      return { ok: true };
    },
    getAtendidosPersonales: async () => {
      ctx.staff();
      const tasks = await ctx.page("shift_tasks", {
        filter: (q) =>
          q
            .in("state", ["resolved", "cancelled"])
            .or(
              "assigned_to.eq." +
                ctx.profile.id +
                ",assigned_csr.eq." +
                ctx.profile.id,
            )
            .gte(
              "updated_at",
              new Date(Date.now() - 30 * 86400000).toISOString(),
            ),
        order: "updated_at",
        limit: 50,
      });
      const history = await ctx.page("load_history", {
        filter: (q) =>
          q.gte(
            "changed_at",
            new Date(Date.now() - 30 * 86400000).toISOString(),
          ),
        order: "changed_at",
        limit: 100,
      });
      const items = tasks.records.map((row) => ({
        id: "task:" + row.id,
        load: row.load || "",
        title: row.note,
        kind: row.state === "cancelled" ? "Tarea cancelada" : "Tarea atendida",
        at: row.resolved_at || row.updated_at,
      }));
      for (const row of history.records) {
        const a = row.after_data || {},
          b = row.before_data || {};
        let title = "",
          kind = "";
        if (b.next_review_at && !a.next_review_at) {
          title = b.next_review_note || "Seguimiento de carga";
          kind = "Seguimiento atendido";
        } else if (marked(b.punctual_pending) && !marked(a.punctual_pending)) {
          title = b.punctual_note || "Pendiente puntual";
          kind = "Pendiente resuelto";
        } else if (
          a.instruction_context?.state === "completed" &&
          b.instruction_context?.state !== "completed"
        ) {
          title = a.instruction_context.action || "Instrucción";
          kind = "Instrucción atendida";
        }
        if (title)
          items.push({
            id: "load:" + row.id,
            load: row.load,
            title,
            kind,
            at: row.changed_at,
          });
      }
      return {
        ok: true,
        items: items
          .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
          .slice(0, 50),
      };
    },
  };
}
