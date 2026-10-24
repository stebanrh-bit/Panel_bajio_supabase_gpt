import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { tableColumns } from "../src/data/columns.js";
import { createTestDatabase } from "./helpers/database.js";
const files = (
  await readdir(new URL("../../supabase/migrations/", import.meta.url))
)
  // Contrato de compatibilidad hasta 015; la restricción personal 016 tiene su propia prueba.
  .filter((f) => /^\d.*sql$/.test(f) && !f.startsWith("016_"))
  .sort();

test("organización: deltas, checklist, programación y permisos en PostgreSQL", async (t) => {
  const { db, people, asUser, rpc, row } = await createTestDatabase(files, {
    Admin: "admin",
    Ana: "csr",
    Luis: "csr",
    Cliente: "client",
    Gerencia: "manager",
    Supervisor: "admin",
  });
  const one = async (name, values) => (await rpc(name, values)).rows[0];
  try {
    await asUser("Admin");
    await db.exec(
      "insert into loads(load,customer,status) values ('A','ACME','Cargando'),('B','OTRO','Cargando')",
    );
    await t.test(
      "CSR consulta toda la operación; revisiones y tombstones incluyen archivo",
      async () => {
        await asUser("Ana");
        const first = (await one("ops_loads_delta", [0, [], "", null, 500]))
          .ops_loads_delta;
        assert.equal(first.items.length, 2);
        assert.equal(first.full, true);
        await db.exec("update loads set trailer='T0132' where load='A'");
        const delta = (
          await one("ops_loads_delta", [
            first.revision,
            ["A", "B"],
            "",
            null,
            500,
          ])
        ).ops_loads_delta;
        assert.deepEqual(
          delta.items.map((r) => r.load),
          ["A"],
        );
        await asUser("Admin");
        await rpc("ops_archive_load", [
          "B",
          (
            await db.query(
              "select updated_at::text as v from loads where load='B'",
            )
          ).rows[0].v,
          true,
        ]);
        await asUser("Ana");
        const removed = (
          await one("ops_loads_delta", [
            delta.revision,
            ["A", "B"],
            "",
            null,
            500,
          ])
        ).ops_loads_delta;
        assert.deepEqual(removed.removed, ["B"]);
      },
    );
    let task, template, dependency;
    await t.test(
      "una tarea no se completa con pasos obligatorios pendientes",
      async () => {
        const create = await rpc("ops_save_tasks", [
          {
            note: "Revisar documentación",
            assigned_to: people.Ana,
            loads: ["A"],
          },
          null,
          null,
        ]);
        task = create.rows[0];
        template = await one("ops_save_checklist", [
          null,
          null,
          "Documentos",
          [
            { label: "Confirmar DODA", required: true },
            { label: "Nota opcional", required: false },
          ],
        ]);
        await rpc("ops_attach_checklist", [
          task.id,
          task.updated_at,
          template.id,
        ]);
        task = await row("shift_tasks", task.id);
        await assert.rejects(
          rpc("ops_change_task_state", [task.id, task.version, "resolved", ""]),
          /pasos obligatorios/,
        );
        const details = (await one("ops_task_details", [task.id, 0]))
          .ops_task_details;
        await rpc("ops_check_task_item", [
          task.id,
          details.checklist[0].item_id,
          true,
        ]);
        task = await row("shift_tasks", task.id);
        assert.equal(
          (
            await one("ops_change_task_state", [
              task.id,
              task.version,
              "resolved",
              "",
            ])
          ).state,
          "resolved",
        );
        task = await row("shift_tasks", task.id);
        await rpc("ops_change_task_state", [task.id, task.version, "open", ""]);
      },
    );
    await t.test(
      "dependencias sin ciclos y resolución bloqueada hasta completar antecedentes",
      async () => {
        dependency = (
          await rpc("ops_save_tasks", [
            { note: "Paso anterior", assigned_to: people.Ana },
            null,
            null,
          ])
        ).rows[0];
        task = await row("shift_tasks", task.id);
        await rpc("ops_set_task_dependency", [
          task.id,
          task.version,
          dependency.id,
          true,
        ]);
        dependency = await row("shift_tasks", dependency.id);
        await assert.rejects(
          rpc("ops_set_task_dependency", [
            dependency.id,
            dependency.version,
            task.id,
            true,
          ]),
          /ciclo/,
        );
        task = await row("shift_tasks", task.id);
        await assert.rejects(
          rpc("ops_change_task_state", [task.id, task.version, "resolved", ""]),
          /Primero completa/,
        );
        await rpc("ops_change_task_state", [
          dependency.id,
          dependency.version,
          "resolved",
          "",
        ]);
        task = await row("shift_tasks", task.id);
        await rpc("ops_change_task_state", [
          task.id,
          task.version,
          "resolved",
          "",
        ]);
      },
    );
    await t.test(
      "tareas privadas y funciones internas bloqueadas",
      async () => {
        await asUser("Luis");
        await assert.rejects(
          rpc("ops_task_details", [task.id, 0]),
          /permiso|acceso|consultar/,
        );
        for (const fn of ["ops_tick_tasks_internal", "ops_backup_manifest"])
          await assert.rejects(rpc(fn, []), /permission|permiso/i);
        await asUser("Cliente");
        await assert.rejects(
          rpc("ops_loads_delta", [0, [], "", null, 500]),
          /permiso|sesión/i,
        );
        await assert.rejects(
          rpc("ops_save_vg_contact", [null, null, { name: "externo" }]),
          /permiso/i,
        );
      },
    );
    let schedule;
    await t.test(
      "recurrencia idempotente y solo una recuperación atrasada",
      async () => {
        await asUser("Ana");
        schedule = await one("ops_save_task_schedule", [
          null,
          null,
          {
            note: "Revisión diaria",
            assigned_to: people.Ana,
            cadence: "daily",
            weekdays: [1, 2, 3, 4, 5],
            local_time: "09:00",
            checklist_id: template.id,
          },
        ]);
        await db.exec("reset role");
        await db.query(
          "update task_schedules set next_run_at=now()-interval '3 days' where id=$1",
          [schedule.id],
        );
        await asUser("Admin");
        assert.equal(
          (await one("ops_run_task_automation", [])).ops_run_task_automation
            .generated,
          1,
        );
        assert.equal(
          (await one("ops_run_task_automation", [])).ops_run_task_automation
            .generated,
          0,
        );
        const generated = (
          await db.query("select * from shift_tasks where schedule_id=$1", [
            schedule.id,
          ])
        ).rows;
        assert.equal(generated.length, 1);
        assert.equal(
          (
            await db.query(
              "select count(*)::int as n from task_checklist_items where task_id=$1",
              [generated[0].id],
            )
          ).rows[0].n,
          2,
        );
      },
    );
    await t.test(
      "avisos vencidos dejan de mostrarse al renovar o resolver; envío externo apagado",
      async () => {
        await asUser("Ana");
        let due = (
          await rpc("ops_save_tasks", [
            {
              note: "Seguimiento vencido",
              assigned_to: people.Ana,
              follow_up_at: new Date(Date.now() - 7200000).toISOString(),
            },
            null,
            null,
          ])
        ).rows[0];
        await asUser("Admin");
        await rpc("ops_run_task_automation", []);
        await asUser("Ana");
        let alerts = (await rpc("ops_visible_alerts", [])).rows;
        assert.ok(alerts.some((a) => a.task_id === due.id));
        due = await row("shift_tasks", due.id);
        await rpc("ops_save_tasks", [
          {
            ...due,
            follow_up_at: new Date(Date.now() + 3600000).toISOString(),
          },
          due.id,
          due.version,
        ]);
        alerts = (await rpc("ops_visible_alerts", [])).rows;
        assert.equal(
          alerts.some((a) => a.task_id === due.id),
          false,
        );
        const config = (await db.query("select * from panel_settings")).rows[0];
        assert.equal(config.external_alerts_enabled, false);
        assert.equal(config.escalation_enabled, false);
        assert.equal(config.archive_days, null);
      },
    );
    await t.test(
      "cancelar exige motivo y conserva historial; referencias y contacto externos opcionales",
      async () => {
        await asUser("Ana");
        let open = (
          await rpc("ops_save_tasks", [
            { note: "Cancelar con motivo", assigned_to: people.Ana },
            null,
            null,
          ])
        ).rows[0];
        await assert.rejects(
          rpc("ops_change_task_state", [
            open.id,
            open.updated_at,
            "cancelled",
            "",
          ]),
          /motivo/,
        );
        const cancelled = await one("ops_change_task_state", [
          open.id,
          open.updated_at,
          "cancelled",
          "Captura duplicada",
        ]);
        assert.equal(cancelled.cancel_reason, "Captura duplicada");
        const contact = await one("ops_save_vg_contact", [
          null,
          null,
          { name: "CSR externo", company: "VG" },
        ]);
        assert.equal(contact.name, "CSR externo");
        const reserved = await one("ops_save_reserved_details", [
          null,
          null,
          {
            load: "VG-1",
            csr_owner: "Captura manual",
            related_load: "A",
            free_reference: "REF-1",
            vg_contact_id: "",
          },
        ]);
        assert.equal(reserved.free_reference, "REF-1");
        assert.equal(reserved.vg_contact_id, null);
        await assert.rejects(
          rpc("change_reserved_load_state", [
            reserved.id,
            reserved.updated_at,
            "liberado",
            "",
          ]),
          /motivo/,
        );
      },
    );
    await t.test(
      "respaldo completo incluye rutas y organización; retención predeterminada no borra nada",
      async () => {
        await asUser("Admin");
        const manifest = (await one("ops_backup_manifest", []))
          .ops_backup_manifest;
        for (const name of [
          "original_routes",
          "original_places",
          "original_radar",
          "original_preferences",
          "task_schedules",
          "task_checklist_items",
          "vg_contacts",
        ])
          assert.ok(manifest.tables.includes(name), name);
        for (const table of manifest.tables)
          assert.ok(
            Array.isArray((await rpc("ops_backup_page", [table, 0, 500])).rows),
            table,
          );
        const plan = (await one("ops_retention_preview", []))
          .ops_retention_preview;
        assert.deepEqual(plan.archive_loads, []);
        assert.deepEqual(plan.prune_imports, []);
        await assert.rejects(rpc("ops_apply_retention", [plan, ""]), /motivo/);
      },
    );
    await t.test(
      "reglas, alias y motivos se validan también en el servidor",
      async () => {
        await asUser("Admin");
        let config = (
          await db.query(
            "select *,updated_at::text as version from panel_settings",
          )
        ).rows[0];
        await rpc("ops_save_panel_settings", [
          { ...config, status_transitions: { Cargando: ["En transito"] } },
          config.version,
        ]);
        await assert.rejects(
          db.exec("update loads set status='DELIVERED' where load='A'"),
          /avance/,
        );
        await db.exec("update loads set status='En transito' where load='A'");
        config = (
          await db.query(
            "select *,updated_at::text as version from panel_settings",
          )
        ).rows[0];
        await rpc("ops_save_panel_settings", [
          { ...config, status_transitions: {} },
          config.version,
        ]);
        await assert.rejects(
          db.exec("update loads set status='Cancelado.' where load='A'"),
          /motivo/,
        );
        const version = (
          await db.query(
            "select updated_at::text as v from loads where load='A'",
          )
        ).rows[0].v;
        await rpc("ops_bulk_loads", [
          [{ load: "A", updated_at: version }],
          { status: "Cancelado.", cancel_reason: "Captura de prueba" },
        ]);
        assert.equal(
          (await db.query("select cancel_reason from loads where load='A'"))
            .rows[0].cancel_reason,
          "Captura de prueba",
        );
        await rpc("ops_assign_customer", ["ACME", people.Ana, null]);
        await rpc("ops_save_customer_alias", ["ACME", "ACME MÉXICO"]);
        await db.exec(
          "insert into loads(load,customer) values ('ALIAS','ACME')",
        );
        assert.equal(
          (await db.query("select customer from loads where load='ALIAS'"))
            .rows[0].customer,
          "ACME MÉXICO",
        );
        assert.equal(
          (await db.query("select customer from loads where load='A'")).rows[0]
            .customer,
          "ACME",
        );
        assert.equal(
          (
            await db.query(
              "select owner_id from customer_assignments where customer='ACME MÉXICO'",
            )
          ).rows[0].owner_id,
          people.Ana,
        );
      },
    );
    await t.test(
      "escalamiento cambia de destinatario sin reutilizar un aviso viejo; envío sigue apagado",
      async () => {
        await asUser("Admin");
        let config = (
          await db.query(
            "select *,updated_at::text as version from panel_settings",
          )
        ).rows[0];
        await rpc("ops_save_panel_settings", [
          {
            ...config,
            escalation_enabled: true,
            escalation_hours: 1,
            supervisor_id: people.Admin,
          },
          config.version,
        ]);
        const due = (
          await rpc("ops_save_tasks", [
            {
              note: "Pendiente para escalar",
              assigned_to: people.Ana,
              follow_up_at: new Date(Date.now() - 3 * 3600000).toISOString(),
            },
            null,
            null,
          ])
        ).rows[0];
        await rpc("ops_run_task_automation", []);
        let alerts = (await rpc("ops_visible_alerts", [])).rows;
        assert.ok(
          alerts.some((a) => a.kind === "escalation" && a.task_id === due.id),
        );
        config = (
          await db.query(
            "select *,updated_at::text as version from panel_settings",
          )
        ).rows[0];
        await rpc("ops_save_panel_settings", [
          { ...config, supervisor_id: people.Supervisor },
          config.version,
        ]);
        await rpc("ops_run_task_automation", []);
        assert.equal(
          (await rpc("ops_visible_alerts", [])).rows.some(
            (a) => a.kind === "escalation" && a.task_id === due.id,
          ),
          false,
        );
        await asUser("Supervisor");
        assert.ok(
          (await rpc("ops_visible_alerts", [])).rows.some(
            (a) => a.kind === "escalation" && a.task_id === due.id,
          ),
        );
        await asUser("Admin");
        config = (
          await db.query(
            "select *,updated_at::text as version from panel_settings",
          )
        ).rows[0];
        await rpc("ops_save_panel_settings", [
          { ...config, escalation_enabled: false },
          config.version,
        ]);
        assert.equal(
          (await rpc("ops_visible_alerts", [])).rows.some(
            (a) => a.kind === "escalation" && a.task_id === due.id,
          ),
          false,
        );
        await db.exec("reset role");
        const secret = "LOCAL_ONLY_TEST_".repeat(5);
        await db.query(
          "update original_google_worker_config set enabled=true,token_hash=encode(sha256(convert_to($1,'UTF8')),'hex')",
          [secret],
        );
        await asUser("anon");
        assert.deepEqual(
          (await rpc("ops_claim_alert_emails", [secret, 20])).rows,
          [],
        );
        await assert.rejects(
          rpc("ops_claim_alert_emails", [secret, null]),
          /20 avisos/,
        );
        await assert.rejects(
          rpc("ops_claim_alert_emails", ["incorrecto", 20]),
          /autorizado/,
        );
      },
    );
    await t.test(
      "rutas conservan ambos sentidos con millas independientes",
      async () => {
        await asUser("Ana");
        await rpc("ops_original_routes", [
          [
            { origen: "a|tx", destino: "b|tx", millas: 100, horas: 2 },
            { origen: "b|tx", destino: "a|tx", millas: 120, horas: 3 },
          ],
        ]);
        const routes = (
          await db.query("select miles from original_routes order by route_key")
        ).rows;
        assert.deepEqual(
          routes.map((r) => Number(r.miles)),
          [100, 120],
        );
      },
    );
    await t.test(
      "retención manual rechaza vista obsoleta y conserva expedientes al archivar",
      async () => {
        await asUser("Admin");
        await db.exec(
          "insert into loads(load,customer,status,pod_sent) values ('RETENCION','Cliente antiguo','DELIVERED','true');insert into comments(load,body) values('RETENCION','Comentario que debe conservarse')",
        );
        await db.exec(
          "reset role;alter table loads disable trigger stamp_load;update loads set updated_at=now()-interval '40 days' where load='RETENCION';alter table loads enable trigger stamp_load;",
        );
        const batch = (
          await db.query(
            "insert into import_batches(file_name,created_by,created_at) values ('Antigua',$1,now()-interval '40 days') returning id",
            [people.Admin],
          )
        ).rows[0];
        await db.query(
          "insert into import_rows(batch_id,load,after_data) values($1,$2,$3)",
          [batch.id, "RETENCION", { load: "RETENCION" }],
        );
        await asUser("Admin");
        let config = (
          await db.query(
            "select *,updated_at::text as version from panel_settings",
          )
        ).rows[0];
        await rpc("ops_save_panel_settings", [
          { ...config, archive_days: 30, import_retention_days: 30 },
          config.version,
        ]);
        const plan = (await one("ops_retention_preview", []))
          .ops_retention_preview;
        assert.ok(plan.archive_loads.includes("RETENCION"));
        assert.ok(plan.prune_imports.includes(batch.id));
        await rpc("ops_save_vg_contact", [
          null,
          null,
          { name: "Nueva información durante revisión" },
        ]);
        await assert.rejects(
          rpc("ops_apply_retention", [plan, "Revisión manual con respaldo"]),
          /cambiaron/,
        );
        const fresh = (await one("ops_retention_preview", []))
          .ops_retention_preview;
        await rpc("ops_apply_retention", [
          fresh,
          "Revisión manual con respaldo",
        ]);
        assert.equal(
          (await db.query("select archived from loads where load='RETENCION'"))
            .rows[0].archived,
          true,
        );
        assert.equal(
          (
            await db.query(
              "select count(*)::int as n from comments where load='RETENCION'",
            )
          ).rows[0].n,
          1,
        );
        assert.equal(
          (
            await db.query(
              "select count(*)::int as n from import_batches where id=$1",
              [batch.id],
            )
          ).rows[0].n,
          0,
        );
      },
    );
    await t.test(
      "el seguimiento con POD pendiente persiste hasta confirmar el documento",
      async () => {
        await asUser("Admin");
        await db.query(
          "insert into loads(load,customer,status,pod_sent,next_review_at) values('POD-PENDIENTE','ACME','DELIVERED','false',$1)",
          [new Date(Date.now() - 3600000).toISOString()],
        );
        await rpc("ops_run_task_automation", []);
        assert.ok(
          (await rpc("ops_visible_alerts", [])).rows.some(
            (a) => a.load === "POD-PENDIENTE",
          ),
        );
        await db.exec(
          "update loads set pod_sent='true' where load='POD-PENDIENTE'",
        );
        assert.equal(
          (await rpc("ops_visible_alerts", [])).rows.some(
            (a) => a.load === "POD-PENDIENTE",
          ),
          false,
        );
      },
    );
    await t.test(
      "retirar un apartado cerrado conserva estado, motivo e historial",
      async () => {
        await asUser("Ana");
        let reserved = await one("ops_save_reserved_details", [
          null,
          null,
          { load: "VG-CERRADO", csr_owner: "CSR manual" },
        ]);
        await rpc("change_reserved_load_state", [
          reserved.id,
          reserved.updated_at,
          "liberado",
          "Ya no se requiere",
        ]);
        reserved = await row("reserved_loads", reserved.id);
        await rpc("ops_hide_reserved_reason", [
          reserved.id,
          reserved.version,
          "Retirar de la lista de consulta",
        ]);
        const saved = await row("reserved_loads", reserved.id);
        assert.equal(saved.hidden, true);
        assert.equal(saved.state, "liberado");
        assert.ok(
          (
            await db.query(
              "select * from reserved_load_history where reserved_id=$1 and note='Retirar de la lista de consulta'",
              [reserved.id],
            )
          ).rows.length,
        );
      },
    );
    await t.test("columnas de lectura corresponden al esquema", async () => {
      for (const [table, columns] of Object.entries(tableColumns))
        await db.query("select " + columns + " from " + table + " limit 0");
    });
    await t.test("migraciones repetibles", async () => {
      await db.exec("reset role");
      for (const file of files.slice(-2))
        await db.exec(
          await readFile(
            new URL("../../supabase/migrations/" + file, import.meta.url),
            "utf8",
          ),
        );
    });
  } finally {
    await db.close();
  }
});
