import { createImportsService } from "../../features/imports/service.js";
/** Organización del turno. La autorización y las versiones se comprueban otra vez en SQL. */
export function organizationMethods(ctx) {
  const tables = [
    "panel_settings",
    "customer_aliases",
    "vg_contacts",
    "task_checklist_templates",
    "task_schedules",
  ];
  const saved = (table, row) => {
    ctx.saved(table, row, table === "panel_settings" ? "singleton" : "id");
    return row;
  };
  const version = (table, id) =>
    id ? ctx.previous(table, id).updated_at : null;
  return {
    getRespaldoCompleto: async () => {
      ctx.staff(true);
      if (ctx.profile.role !== "admin")
        throw Error("Solo Admin puede generar el respaldo.");
      return ctx.safe(createImportsService(ctx.client).backup());
    },
    getOrganizacion: async () => {
      ctx.staff();
      const result = Object.fromEntries(
        await Promise.all(
          tables.map(async (table) => {
            const data = await ctx.rows(
              table,
              (query) => query,
              table === "panel_settings"
                ? "singleton"
                : table === "customer_aliases"
                  ? "alias_key"
                  : "id",
            );
            ctx.remember(
              table,
              data,
              table === "panel_settings"
                ? "singleton"
                : table === "customer_aliases"
                  ? "alias_key"
                  : "id",
            );
            return [table, data];
          }),
        ),
      );
      result.people = ctx
        .records("profiles")
        .filter((p) => p.active && ["admin", "csr"].includes(p.role))
        .map(({ id, display_name, role }) => ({ id, display_name, role }));
      result.loads = ctx
        .records("loads")
        .filter(
          (p) =>
            !p.archived &&
            !/^(delivered|completed|entregado|completado|cancelado\.?|tonu)$/i.test(
              p.status,
            ),
        )
        .map(({ load, customer }) => ({ load, customer }));
      result.tasks = ctx.records("shift_tasks");
      return { ok: true, ...result, admin: ctx.profile.role === "admin" };
    },
    guardarReglas: async (values) => {
      ctx.staff(true);
      if (ctx.profile.role !== "admin")
        throw Error("Solo Admin puede cambiar reglas.");
      return saved(
        "panel_settings",
        await ctx.rpc("ops_save_panel_settings", {
          p_values: values,
          p_version: version("panel_settings", true),
        }),
      );
    },
    guardarAliasCliente: async (alias, canonical) => {
      ctx.staff(true);
      await ctx.rpc("ops_save_customer_alias", {
        p_alias: alias,
        p_canonical: canonical,
      });
      return { ok: true };
    },
    guardarContactoVG: async (id, values) => {
      ctx.staff(true);
      return saved(
        "vg_contacts",
        await ctx.rpc("ops_save_vg_contact", {
          p_id: id || null,
          p_version: version("vg_contacts", id),
          p_values: values,
        }),
      );
    },
    guardarChecklist: async (id, name, items) => {
      ctx.staff(true);
      return saved(
        "task_checklist_templates",
        await ctx.rpc("ops_save_checklist", {
          p_id: id || null,
          p_version: version("task_checklist_templates", id),
          p_name: name,
          p_items: items,
        }),
      );
    },
    guardarProgramacion: async (id, values) => {
      ctx.staff(true);
      return saved(
        "task_schedules",
        await ctx.rpc("ops_save_task_schedule", {
          p_id: id || null,
          p_version: version("task_schedules", id),
          p_values: values,
        }),
      );
    },
    getDetalleTarea: async (id, offset = 0) => {
      ctx.staff();
      const r = await ctx.rpc("ops_task_details", {
        p_id: id,
        p_offset: offset,
      });
      ctx.saved("shift_tasks", r.task);
      return r;
    },
    agregarChecklistTarea: async (id, template) => {
      ctx.staff(true);
      await ctx.rpc("ops_attach_checklist", {
        p_task: id,
        p_version: version("shift_tasks", id),
        p_template: template,
      });
      return { ok: true };
    },
    marcarPasoTarea: async (id, item, done) => {
      ctx.staff(true);
      await ctx.rpc("ops_check_task_item", {
        p_task: id,
        p_item: item,
        p_done: done,
      });
      return { ok: true };
    },
    guardarDependencia: async (id, other, enabled) => {
      ctx.staff(true);
      await ctx.rpc("ops_set_task_dependency", {
        p_task: id,
        p_version: version("shift_tasks", id),
        p_depends: other,
        p_add: enabled,
      });
      return { ok: true };
    },
    getAvisosOperacion: async () => {
      ctx.staff();
      return ctx.rpc("ops_visible_alerts");
    },
    leerAvisoOperacion: async (id) => {
      ctx.staff(true);
      await ctx.rpc("ops_read_operational_alert", { p_id: id });
      return { ok: true };
    },
    ejecutarProgramaciones: async () => {
      ctx.staff(true);
      return ctx.rpc("ops_run_task_automation");
    },
    getPlanRetencion: async () => {
      ctx.staff(true);
      return ctx.rpc("ops_retention_preview");
    },
    aplicarRetencion: async (plan, reason) => {
      ctx.staff(true);
      return ctx.rpc("ops_apply_retention", {
        p_preview: plan,
        p_reason: reason,
      });
    },
  };
}
