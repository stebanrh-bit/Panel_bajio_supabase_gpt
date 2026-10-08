import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createTestDatabase } from "./helpers/database.js";

test("equipo y turnos: permisos, asignaciones, bitácora, plantillas y portal aislado", async (context) => {
  const { db, people, asUser, row, rpc } = await createTestDatabase(
    [
      "001_panel.sql",
      "002_load_operations.sql",
      "003_pending_loads.sql",
      "004_reserved_loads.sql",
      "005_team_and_shifts.sql",
    ],
    {
      csr: "csr",
      other: "csr",
      outsider: "csr",
      admin: "admin",
      manager: "manager",
      client: "client",
      clientOther: "client",
      pending: "pending",
    },
  );
  let task, template;
  const saveTasks = (values, previous = null) =>
    rpc("ops_save_tasks", [
      JSON.stringify(values),
      previous?.id || null,
      previous?.version || null,
    ]);
  try {
    await context.test(
      "administración: perfiles, cliente normalizado y cuenta propia protegida",
      async () => {
        await asUser("csr");
        const profile = await row("profiles", people.csr);
        await assert.rejects(
          rpc("ops_save_profile", [
            people.csr,
            profile.version,
            "Otro",
            "admin",
            true,
            "",
          ]),
          /permiso/,
        );
        await asUser("admin");
        const own = await row("profiles", people.admin);
        await assert.rejects(
          rpc("ops_save_profile", [
            people.admin,
            own.version,
            "Admin",
            "pending",
            true,
            "",
          ]),
          /administrador activo/,
        );
        await rpc("ops_save_profile", [
          people.csr,
          profile.version,
          "Operador de prueba",
          "csr",
          true,
          "",
        ]);
        await assert.rejects(
          rpc("ops_save_profile", [
            people.csr,
            profile.version,
            "Versión antigua",
            "csr",
            true,
            "",
          ]),
          /cambió/,
        );
        await rpc("ops_assign_customer", [" ACME   BAJÍO ", people.csr, null]);
        const assignment = (
          await db.query(
            "select *,updated_at::text as version from customer_assignments",
          )
        ).rows[0];
        assert.equal(assignment.customer_key, "acme bajío");
        await assert.rejects(
          rpc("ops_assign_customer", ["acme bajío", people.other, null]),
          /cambió/,
        );
        await rpc("ops_assign_customer", [
          "acme bajío",
          people.other,
          assignment.version,
        ]);
        assert.equal(
          (await db.query("select * from customer_assignments")).rows.length,
          1,
        );
        assert.equal(
          (await db.query("select * from customer_assignments")).rows[0]
            .owner_id,
          people.other,
        );
        await db.exec(
          "insert into loads(load,customer,status,charges) values ('T-1','ACME BAJÍO','Cargando','PRIVADO'),('T-2','Cliente ajeno','Cargando','OTRO PRIVADO')",
        );
      },
    );

    await context.test(
      "administrador operador: asignaciones propias sin perder administración ni asumir rol Cliente",
      async () => {
        await asUser("admin");
        await rpc("ops_assign_customer", [
          "CLIENTE PROPIO",
          people.admin,
          null,
        ]);
        assert.equal(
          (
            await db.query(
              "select owner_id from customer_assignments where customer_key='cliente propio'",
            )
          ).rows[0].owner_id,
          people.admin,
        );
        assert.equal((await row("profiles", people.admin)).role, "admin");
        await assert.rejects(
          rpc("ops_portal_loads", []),
          /portal no autorizado/,
        );
      },
    );

    await context.test(
      "bitácora: múltiples cargas, autor real, seguimiento y reversión integral",
      async () => {
        await asUser("csr");
        const values = {
          note: "Llamar al operador",
          assigned_to: people.other,
          assigned_csr: people.other,
          loads: ["T-1", "T-1"],
          color: "warn",
          created_by: people.admin,
        };
        const result = await saveTasks(values);
        assert.equal(result.rows.length, 1);
        task = await row("shift_tasks", result.rows[0].id);
        assert.equal(task.created_by, people.csr);
        assert.equal(
          (await db.query("select * from comments where load='T-1'")).rows
            .length,
          1,
        );
        const before = (
          await db.query("select count(*)::int as count from shift_tasks")
        ).rows[0].count;
        await assert.rejects(
          saveTasks({ ...values, loads: ["T-1", "NO-EXISTE"] }),
          /no existe/,
        );
        assert.equal(
          (await db.query("select count(*)::int as count from shift_tasks"))
            .rows[0].count,
          before,
        );
        assert.equal(
          (await db.query("select * from comments where load='T-1'")).rows
            .length,
          1,
        );
        await asUser("outsider");
        assert.equal(await row("shift_tasks", task.id), undefined);
        await assert.rejects(
          rpc("ops_set_task_state", [task.id, task.version, "resolved"]),
          /sin permiso/,
        );
        await rpc("ops_set_following", [[people.other]]);
        assert.ok(await row("shift_tasks", task.id));
        await rpc("ops_set_following", [[]]);
        assert.equal(await row("shift_tasks", task.id), undefined);
        await asUser("other");
        await rpc("ops_set_task_state", [task.id, task.version, "resolved"]);
        task = await row("shift_tasks", task.id);
        assert.ok(task.resolved_at);
        const resolved = task;
        await asUser("csr");
        await rpc("ops_set_task_state", [task.id, task.version, "open"]);
        task = await row("shift_tasks", task.id);
        assert.equal(task.resolved_at, null);
        await assert.rejects(
          rpc("ops_set_task_state", [
            resolved.id,
            resolved.version,
            "cancelled",
          ]),
          /cambió/,
        );
        await saveTasks({ ...values, load: "T-1", note: "Nota editada" }, task);
        task = await row("shift_tasks", task.id);
        assert.equal(task.note, "Nota editada");
        await rpc("ops_set_task_state", [task.id, task.version, "cancelled"]);
        assert.equal((await row("shift_tasks", task.id)).state, "cancelled");
        assert.equal(
          (
            await db.query(
              "select * from shift_task_history where task_id=$1",
              [task.id],
            )
          ).rows.length,
          5,
        );
      },
    );

    await context.test(
      "plantillas personales, cierres y seguimiento individual de cargas",
      async () => {
        await asUser("csr");
        const created = await rpc("ops_save_template", [
          "Entrega",
          "Carga {load}",
          null,
          null,
        ]);
        template = await row("message_templates", created.rows[0].id);
        await rpc("ops_save_closure", ["Resumen del turno"]);
        await rpc("ops_follow_load", ["T-1", true]);
        await rpc("ops_follow_load", ["T-1", true]);
        assert.equal(
          (await db.query("select * from load_followers")).rows.length,
          1,
        );
        await asUser("other");
        assert.equal(
          (await db.query("select * from message_templates")).rows.length,
          0,
        );
        await assert.rejects(
          rpc("ops_save_template", [
            "Ajena",
            "No cambiar",
            template.id,
            template.version,
          ]),
          /permiso/,
        );
        assert.equal(
          (await db.query("select * from shift_closures")).rows.length,
          0,
        );
        await rpc("ops_set_following", [[people.csr]]);
        assert.equal(
          (await db.query("select * from shift_closures")).rows.length,
          1,
        );
        await asUser("manager");
        assert.equal(
          (await db.query("select * from shift_closures")).rows.length,
          1,
        );
        await assert.rejects(
          rpc("ops_save_closure", ["Sin permiso"]),
          /permiso/,
        );
        await assert.rejects(
          rpc("ops_set_task_state", [
            task.id,
            (await row("shift_tasks", task.id)).version,
            "open",
          ]),
          /permiso/,
        );
        await asUser("csr");
        await rpc("ops_save_template", [
          "Entrega editada",
          "Carga {load}: {status}",
          template.id,
          template.version,
        ]);
        await assert.rejects(
          rpc("ops_delete_template", [template.id, template.version]),
          /cambió/,
        );
        await rpc("ops_delete_template", [
          template.id,
          (await row("message_templates", template.id)).version,
        ]);
        assert.equal(
          (await db.query("select * from message_templates")).rows.length,
          0,
        );
      },
    );

    await context.test(
      "portal: cliente de la sesión, columnas limitadas y sin acceso a tablas internas",
      async () => {
        await asUser("admin");
        await rpc("ops_set_portal_access", [people.client, "acme bajío", true]);
        await rpc("ops_set_portal_access", [
          people.clientOther,
          "Cliente ajeno",
          true,
        ]);
        await db.exec("reset role");
        await db.query(
          "insert into comments(load,body,created_by) values('T-1','Comentario interno',$1)",
          [people.csr],
        );
        await db.query(
          "insert into communications(load,event_type,reason,actor,public_message) values('T-1','NOTIFICADO','MOTIVO INTERNO',$1,'Mensaje público')",
          [people.csr],
        );
        await asUser("client");
        const list = (await rpc("ops_portal_loads", [0, 100])).rows;
        assert.equal(list.length, 1);
        assert.equal(list[0].load, "T-1");
        assert.equal(Object.hasOwn(list[0], "charges"), false);
        assert.equal((await db.query("select * from loads")).rows.length, 0);
        assert.equal((await db.query("select * from comments")).rows.length, 0);
        assert.equal(
          (await db.query("select * from shift_tasks")).rows.length,
          0,
        );
        assert.equal((await db.query("select * from profiles")).rows.length, 1);
        await assert.rejects(
          db.query("select * from portal_load_snapshot"),
          /permission denied/,
        );
        const detail = (await rpc("ops_portal_detail", ["T-1"])).rows[0]
          .ops_portal_detail;
        assert.equal(detail.messages[0].message, "Mensaje público");
        assert.equal(JSON.stringify(detail).includes("MOTIVO INTERNO"), false);
        assert.equal(
          JSON.stringify(detail).includes("Comentario interno"),
          false,
        );
        await assert.rejects(rpc("ops_portal_detail", ["T-2"]), /sin acceso/);
        await assert.rejects(
          rpc("ops_save_closure", ["No permitido"]),
          /permiso/,
        );
        await assert.rejects(rpc("ops_portal_loads", [0, 501]), /Página/);
        await asUser("admin");
        await rpc("ops_set_portal_access", [
          people.client,
          "ACME BAJÍO",
          false,
        ]);
        await asUser("client");
        assert.equal((await rpc("ops_portal_loads", [0, 100])).rows.length, 0);
      },
    );

    await context.test(
      "anon y cuentas desactivadas se rechazan; migración repetible",
      async () => {
        await asUser("admin");
        const profile = await row("profiles", people.csr);
        await rpc("ops_save_profile", [
          people.csr,
          profile.version,
          "Operador",
          "csr",
          false,
          "",
        ]);
        await asUser("csr");
        await assert.rejects(
          rpc("ops_save_closure", ["Cuenta inactiva"]),
          /permiso/,
        );
        assert.equal((await db.query("select * from loads")).rows.length, 0);
        await asUser("anon");
        await assert.rejects(
          rpc("ops_save_closure", ["Anónimo"]),
          /permission denied for function/,
        );
        await assert.rejects(
          rpc("ops_log_admin", ["Falso", "{}"]),
          /permission denied for function/,
        );
        await assert.rejects(
          rpc("ops_portal_loads", [0, 100]),
          /permission denied for function/,
        );
        await db.exec("reset role");
        const count = (
          await db.query("select count(*)::int as count from shift_tasks")
        ).rows[0].count;
        await db.exec(
          await readFile(
            new URL(
              "../../supabase/migrations/005_team_and_shifts.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        assert.equal(
          (await db.query("select count(*)::int as count from shift_tasks"))
            .rows[0].count,
          count,
        );
      },
    );
  } finally {
    await db.close();
  }
});
